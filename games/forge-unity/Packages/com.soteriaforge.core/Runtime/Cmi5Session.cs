using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace SoteriaForge.Core
{
    public enum SessionState
    {
        NotStarted,
        Starting,
        Active,
        Terminated,
        /// <summary>The launch could not start, or the server ended it (expired or relaunched).</summary>
        Ended,
    }

    /// <summary>
    /// One cmi5 session with Soteria Forge: fetch the token, read the launch data,
    /// send `initialized`, then queue and deliver statements in order.
    /// No Unity types here, so it runs in EditMode tests.
    /// </summary>
    public sealed class Cmi5Session
    {
        public const string XapiVersion = "1.0.3";
        public const string VerbBase = "https://soteriaforge.com/xapi/verbs/";
        private const string Adl = "http://adlnet.gov/expapi/verbs/";
        private const int MaxBackoffSeconds = 30;

        private readonly Cmi5LaunchParams _launch;
        private readonly IXapiTransport _transport;
        private readonly Func<float, Task> _delay;
        private readonly Action<string> _log;
        private readonly Func<DateTime> _now;
        private readonly List<JObject> _queue = new List<JObject>();
        private readonly JObject _actor;
        private Dictionary<string, string> _headers;
        private Task _pump = Task.CompletedTask;
        private bool _completed;
        private bool _judged;

        public SessionState State { get; private set; } = SessionState.NotStarted;

        /// <summary>Statements not yet accepted by the server.</summary>
        public int Pending => _queue.Count;

        /// <summary>cmi5 moveOn from the launch data, e.g. "CompletedOrPassed".</summary>
        public string MoveOn { get; private set; } = "";

        /// <summary>Why the session ended, in words a learner can be shown.</summary>
        public string EndReason { get; private set; } = "";

        public event Action<SessionState> StateChanged;

        /// <param name="delay">Waits the given seconds before a retry.</param>
        public Cmi5Session(
            Cmi5LaunchParams launch,
            IXapiTransport transport,
            Func<float, Task> delay,
            Action<string> log = null,
            Func<DateTime> now = null)
        {
            _launch = launch ?? throw new ArgumentNullException(nameof(launch));
            _transport = transport ?? throw new ArgumentNullException(nameof(transport));
            _delay = delay ?? throw new ArgumentNullException(nameof(delay));
            _log = log ?? (_ => { });
            _now = now ?? (() => DateTime.UtcNow);
            _actor = JObject.Parse(launch.Actor);
        }

        /// <summary>Returns true when the session is active and `initialized` is queued.</summary>
        public async Task<bool> StartAsync()
        {
            if (State != SessionState.NotStarted) return State == SessionState.Active;
            Set(SessionState.Starting);

            // The fetch URL works exactly once, so it is never retried.
            var fetched = await _transport.SendAsync(
                "POST", _launch.Fetch, null, new Dictionary<string, string>());
            var token = fetched.Ok ? Field(fetched.Body, "auth-token") : null;
            if (string.IsNullOrEmpty(token))
            {
                var code = Field(fetched.Body, "error-code");
                return End(code == "1"
                    ? "This lesson is already open somewhere else. Open it again from the course."
                    : "This lesson could not be started. Open it again from the course.");
            }
            _headers = new Dictionary<string, string>
            {
                ["Authorization"] = "Basic " + token,
                ["X-Experience-API-Version"] = XapiVersion,
            };

            var state = await _transport.SendAsync(
                "GET", _launch.Endpoint + "activities/state?stateId=LMS.LaunchData", null, _headers);
            if (state.Ok) MoveOn = Field(state.Body, "moveOn") ?? "";
            else _log($"Launch data unavailable ({state.Status}); continuing.");

            Set(SessionState.Active);
            Enqueue(Adl + "initialized", "initialized", null, null);
            return true;
        }

        /// <summary>The learner experienced the content. Once per session.</summary>
        public bool Completed()
        {
            if (!Accepting() || _completed) return false;
            _completed = true;
            Enqueue(Adl + "completed", "completed", null,
                new JObject { ["completion"] = true });
            return true;
        }

        /// <summary>The learner met the standard. Score is scaled, -1 to 1.</summary>
        public bool Passed(float scaled) => Judge("passed", true, scaled);

        /// <summary>The learner did not meet the standard. Does not complete the lesson.</summary>
        public bool Failed(float scaled) => Judge("failed", false, scaled);

        /// <summary>
        /// An in-game event. It is stored but does not change progress.
        /// `verb` is a short name ("isolated-energy") or a full IRI.
        /// </summary>
        public bool Record(
            string verb,
            string display,
            string objectId = null,
            IDictionary<string, object> extensions = null)
        {
            if (!Accepting() || string.IsNullOrEmpty(verb)) return false;
            var iri = verb.Contains(":") ? verb : VerbBase + verb;
            JObject result = null;
            if (extensions != null && extensions.Count > 0)
            {
                result = new JObject { ["extensions"] = JObject.FromObject(extensions) };
            }
            Enqueue(iri, display, objectId, result);
            return true;
        }

        /// <summary>Sends `terminated` and waits for the queue to drain or the session to end.</summary>
        public async Task TerminateAsync()
        {
            if (!Accepting())
            {
                await _pump;
                return;
            }
            Enqueue(Adl + "terminated", "terminated", null, null);
            Set(SessionState.Terminated);
            await _pump;
        }

        /// <summary>Waits until every queued statement is delivered or dropped.</summary>
        public Task FlushAsync() => _pump;

        private bool Judge(string verb, bool success, float scaled)
        {
            if (!Accepting() || _judged) return false;
            if (float.IsNaN(scaled)) return false;
            _judged = true;
            var clamped = Math.Round(Math.Max(-1f, Math.Min(1f, scaled)), 4);
            Enqueue(Adl + verb, verb, null,
                new JObject
                {
                    ["success"] = success,
                    ["score"] = new JObject { ["scaled"] = clamped },
                });
            return true;
        }

        private bool Accepting() => State == SessionState.Active;

        private void Enqueue(string verb, string display, string objectId, JObject result)
        {
            var statement = new JObject
            {
                ["id"] = Guid.NewGuid().ToString(),
                // The server replaces actor, registration, session and tenant with its own.
                ["actor"] = _actor,
                ["verb"] = new JObject
                {
                    ["id"] = verb,
                    ["display"] = new JObject { ["en-US"] = display ?? verb },
                },
                ["object"] = new JObject
                {
                    ["objectType"] = "Activity",
                    ["id"] = string.IsNullOrEmpty(objectId) ? _launch.ActivityId : objectId,
                },
                ["context"] = new JObject { ["registration"] = _launch.Registration },
                ["timestamp"] = _now().ToString("o", CultureInfo.InvariantCulture),
            };
            if (result != null) statement["result"] = result;
            _queue.Add(statement);
            if (_pump.IsCompleted) _pump = PumpAsync();
        }

        /// <summary>
        /// One statement at a time, oldest first: the server enforces cmi5 order, and a
        /// retry must not overtake the statement before it.
        /// </summary>
        private async Task PumpAsync()
        {
            var attempt = 0;
            while (_queue.Count > 0 && State != SessionState.Ended)
            {
                var statement = _queue[0];
                var response = await _transport.SendAsync(
                    "POST",
                    _launch.Endpoint + "statements",
                    statement.ToString(Formatting.None),
                    _headers);

                if (response.Ok)
                {
                    _queue.RemoveAt(0);
                    attempt = 0;
                }
                else if (response.Status == 401 || response.Status == 403)
                {
                    End("This lesson was opened again or has expired. Open it again from the course.");
                }
                else if (response.Status == 0 || response.Status == 429 || response.Status >= 500)
                {
                    attempt++;
                    var wait = Math.Min(MaxBackoffSeconds, (float)Math.Pow(2, attempt - 1));
                    _log($"Statement not delivered ({response.Status}); retrying in {wait}s.");
                    await _delay(wait);
                }
                else
                {
                    // Rejected for good (400 invalid, 409 out of order): resending cannot help.
                    _log($"Statement dropped ({response.Status}): {response.Body}");
                    _queue.RemoveAt(0);
                    attempt = 0;
                }
            }
        }

        private bool End(string reason)
        {
            EndReason = reason;
            _log(reason);
            Set(SessionState.Ended);
            return false;
        }

        private void Set(SessionState state)
        {
            if (State == state) return;
            State = state;
            StateChanged?.Invoke(state);
        }

        private static string Field(string json, string name)
        {
            try
            {
                return JObject.Parse(json)[name]?.ToString();
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}
