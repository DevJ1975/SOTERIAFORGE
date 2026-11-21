using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace SoteriaForge.Core.Tests
{
    /// <summary>
    /// The fake transport and delay complete synchronously, so every await in the
    /// session finishes inline and these tests need no async machinery.
    /// </summary>
    public class Cmi5SessionTests
    {
        private const string Endpoint = "https://api.example.test/api/standards/xapi/";
        private const string Activity = "https://soteriaforge.com/xapi/lessons/l1";
        private const string Adl = "http://adlnet.gov/expapi/verbs/";

        private sealed class FakeTransport : IXapiTransport
        {
            public readonly List<(string Method, string Url, string Body, IReadOnlyDictionary<string, string> Headers)> Calls
                = new List<(string, string, string, IReadOnlyDictionary<string, string>)>();
            public XapiResponse Fetch = new XapiResponse(200, "{\"auth-token\": \"dG9rZW4=\"}");
            public XapiResponse State = new XapiResponse(200, "{\"moveOn\": \"CompletedOrPassed\"}");
            /// <summary>Responses for statement posts, in order; 200 once exhausted.</summary>
            public readonly Queue<XapiResponse> Statements = new Queue<XapiResponse>();

            public Task<XapiResponse> SendAsync(
                string method, string url, string body, IReadOnlyDictionary<string, string> headers)
            {
                Calls.Add((method, url, body, headers));
                if (url.Contains("/cmi5/fetch/")) return Task.FromResult(Fetch);
                if (url.Contains("activities/state")) return Task.FromResult(State);
                return Task.FromResult(
                    Statements.Count > 0 ? Statements.Dequeue() : new XapiResponse(200, "[]"));
            }

            public List<JObject> Sent => Calls
                .Where(c => c.Url == Endpoint + "statements")
                .Select(c => JObject.Parse(c.Body))
                .ToList();

            public List<string> Verbs => Sent.Select(s => (string)s["verb"]["id"]).ToList();
        }

        private FakeTransport _transport;
        private List<float> _waits;
        private List<string> _log;

        private Cmi5Session Session()
        {
            var launch = new Cmi5LaunchParams(
                Endpoint,
                "https://api.example.test/api/standards/cmi5/fetch/abc/secret",
                "{\"objectType\": \"Agent\", \"account\": {\"homePage\": \"https://x.test\", \"name\": \"m1\"}}",
                "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                Activity);
            return new Cmi5Session(
                launch,
                _transport,
                seconds => { _waits.Add(seconds); return Task.CompletedTask; },
                _log.Add,
                () => new DateTime(2026, 11, 20, 12, 0, 0, DateTimeKind.Utc));
        }

        private Cmi5Session Started()
        {
            var session = Session();
            Assert.IsTrue(session.StartAsync().Result);
            return session;
        }

        [SetUp]
        public void SetUp()
        {
            _transport = new FakeTransport();
            _waits = new List<float>();
            _log = new List<string>();
        }

        [Test]
        public void StartFetchesTheTokenReadsLaunchDataAndSendsInitialized()
        {
            var session = Started();

            Assert.AreEqual(SessionState.Active, session.State);
            Assert.AreEqual("CompletedOrPassed", session.MoveOn);
            Assert.AreEqual("POST", _transport.Calls[0].Method);
            Assert.IsNull(_transport.Calls[0].Body);
            Assert.AreEqual(0, _transport.Calls[0].Headers.Count);
            Assert.AreEqual(Endpoint + "activities/state?stateId=LMS.LaunchData", _transport.Calls[1].Url);
            Assert.AreEqual("Basic dG9rZW4=", _transport.Calls[1].Headers["Authorization"]);
            Assert.AreEqual("1.0.3", _transport.Calls[2].Headers["X-Experience-API-Version"]);
            CollectionAssert.AreEqual(new[] { Adl + "initialized" }, _transport.Verbs);

            var statement = _transport.Sent[0];
            Assert.AreEqual(Activity, (string)statement["object"]["id"]);
            Assert.AreEqual("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", (string)statement["context"]["registration"]);
            Assert.AreEqual("m1", (string)statement["actor"]["account"]["name"]);
            StringAssert.Contains("\"timestamp\":\"2026-11-20T12:00:00.0000000Z\"", _transport.Calls[2].Body);
            Assert.IsTrue(Guid.TryParse((string)statement["id"], out _));
            Assert.AreEqual(0, session.Pending);
        }

        [Test]
        public void AUsedFetchUrlEndsTheSessionWithoutRetrying()
        {
            _transport.Fetch = new XapiResponse(403, "{\"error-code\": \"1\", \"error-text\": \"used\"}");
            var session = Session();

            Assert.IsFalse(session.StartAsync().Result);
            Assert.AreEqual(SessionState.Ended, session.State);
            StringAssert.Contains("already open", session.EndReason);
            Assert.AreEqual(1, _transport.Calls.Count);
            Assert.IsFalse(session.Completed());
        }

        [Test]
        public void MissingLaunchDataDoesNotBlockTheSession()
        {
            _transport.State = new XapiResponse(404, "");
            Assert.AreEqual(SessionState.Active, Started().State);
        }

        [Test]
        public void ReportsCompletionScoreAndEventsInOrder()
        {
            var session = Started();

            Assert.IsTrue(session.Record("isolated-energy", "isolated energy", "https://x.test/valve",
                new Dictionary<string, object> { ["https://x.test/ext/attempt"] = 2 }));
            Assert.IsTrue(session.Completed());
            Assert.IsTrue(session.Passed(0.857f));
            session.TerminateAsync().Wait();

            CollectionAssert.AreEqual(
                new[]
                {
                    Adl + "initialized",
                    "https://soteriaforge.com/xapi/verbs/isolated-energy",
                    Adl + "completed",
                    Adl + "passed",
                    Adl + "terminated",
                },
                _transport.Verbs);
            var sent = _transport.Sent;
            Assert.AreEqual("https://x.test/valve", (string)sent[1]["object"]["id"]);
            Assert.AreEqual(2, (int)sent[1]["result"]["extensions"]["https://x.test/ext/attempt"]);
            Assert.IsTrue((bool)sent[2]["result"]["completion"]);
            Assert.IsTrue((bool)sent[3]["result"]["success"]);
            Assert.AreEqual(0.857, (double)sent[3]["result"]["score"]["scaled"], 0.0001);
            Assert.AreEqual(SessionState.Terminated, session.State);
            Assert.AreEqual(sent.Count, sent.Select(s => (string)s["id"]).Distinct().Count());
        }

        [Test]
        public void MirrorsTheServerRulesSoAGameCannotTripThem()
        {
            var session = Started();

            Assert.IsTrue(session.Completed());
            Assert.IsFalse(session.Completed());
            Assert.IsFalse(session.Passed(float.NaN));
            Assert.IsTrue(session.Failed(-3f));
            Assert.IsFalse(session.Passed(1f));
            session.TerminateAsync().Wait();
            Assert.IsFalse(session.Record("late", "late"));
            Assert.IsFalse(session.Completed());

            CollectionAssert.AreEqual(
                new[] { Adl + "initialized", Adl + "completed", Adl + "failed", Adl + "terminated" },
                _transport.Verbs);
            Assert.AreEqual(-1.0, (double)_transport.Sent[2]["result"]["score"]["scaled"]);
        }

        [Test]
        public void ASimulatorVerdictCarriesTheActionLogUnderTheServersKey()
        {
            _transport.State = new XapiResponse(200,
                "{\"moveOn\": \"Passed\", \"launchParameters\": "
                + "\"{\\\"seed\\\": \\\"42\\\", "
                + "\\\"actionLogExtension\\\": \\\"https://x.test/log\\\"}\"}");
            var session = Started();
            Assert.AreEqual("42", (string)JObject.Parse(session.LaunchParameters)["seed"]);

            session.Passed(0.8f, new[] { new SimAction(0, "notify"), new SimAction(1500, "shutdown") });

            var log = (JArray)_transport.Sent.Last()["result"]["extensions"]["https://x.test/log"];
            Assert.AreEqual(
                "[{\"t\":0,\"step\":\"notify\"},{\"t\":1500,\"step\":\"shutdown\"}]",
                log.ToString(Newtonsoft.Json.Formatting.None));
        }

        [Test]
        public void WithoutLaunchParametersTheLogUsesTheDefaultKeyAndAnEmptyLogIsLeftOut()
        {
            var session = Started();
            Assert.AreEqual("", session.LaunchParameters);
            session.Failed(0.2f, new[] { new SimAction(0, "verify") });
            Assert.IsNotNull(
                _transport.Sent.Last()["result"]["extensions"][Cmi5Session.ActionLogExtension]);

            _transport = new FakeTransport();
            Started().Passed(1f, new SimAction[0]);
            Assert.IsNull(_transport.Sent.Last()["result"]["extensions"]);
        }

        [Test]
        public void NothingIsReportedBeforeStart()
        {
            var session = Session();
            Assert.IsFalse(session.Completed());
            Assert.IsFalse(session.Record("early", "early"));
            Assert.AreEqual(0, _transport.Calls.Count);
        }

        [Test]
        public void RetriesTheSameStatementWithBackoffUntilItIsAccepted()
        {
            var session = Started();
            _transport.Statements.Enqueue(new XapiResponse(0, "offline"));
            _transport.Statements.Enqueue(new XapiResponse(503, ""));
            _transport.Statements.Enqueue(new XapiResponse(429, ""));

            session.Completed();
            session.Record("after", "after");

            CollectionAssert.AreEqual(new[] { 1f, 2f, 4f }, _waits);
            var sent = _transport.Sent;
            // initialized, completed x4 (same id every time), then the event: order kept.
            Assert.AreEqual(6, sent.Count);
            Assert.AreEqual(1, sent.Skip(1).Take(4).Select(s => (string)s["id"]).Distinct().Count());
            Assert.AreEqual(Adl + "completed", (string)sent[4]["verb"]["id"]);
            Assert.AreEqual("https://soteriaforge.com/xapi/verbs/after", (string)sent[5]["verb"]["id"]);
            Assert.AreEqual(0, session.Pending);
        }

        [Test]
        public void BackoffIsCappedAtThirtySeconds()
        {
            var session = Started();
            for (var i = 0; i < 8; i++) _transport.Statements.Enqueue(new XapiResponse(0, ""));

            session.Completed();

            Assert.AreEqual(30f, _waits.Max());
            Assert.AreEqual(8, _waits.Count);
            Assert.AreEqual(0, session.Pending);
        }

        [Test]
        public void ARejectedStatementIsDroppedAndTheNextStillGoes()
        {
            var session = Started();
            _transport.Statements.Enqueue(new XapiResponse(409, "{\"detail\": \"out of order\"}"));

            session.Completed();
            session.Passed(1f);

            CollectionAssert.AreEqual(
                new[] { Adl + "initialized", Adl + "completed", Adl + "passed" }, _transport.Verbs);
            Assert.AreEqual(0, _waits.Count);
            Assert.AreEqual(0, session.Pending);
            Assert.IsTrue(_log.Any(line => line.Contains("dropped (409)")));
            Assert.AreEqual(SessionState.Active, session.State);
        }

        [TestCase(401)]
        [TestCase(403)]
        public void AnEndedLaunchStopsDeliveryAndTellsTheLearner(int status)
        {
            var session = Started();
            var states = new List<SessionState>();
            session.StateChanged += states.Add;
            _transport.Statements.Enqueue(new XapiResponse(status, ""));

            session.Completed();
            Assert.IsFalse(session.Passed(1f));
            session.TerminateAsync().Wait();

            Assert.AreEqual(SessionState.Ended, session.State);
            CollectionAssert.AreEqual(new[] { SessionState.Ended }, states);
            StringAssert.Contains("Open it again", session.EndReason);
            Assert.AreEqual(2, _transport.Sent.Count);
            Assert.AreEqual(1, session.Pending);
        }
    }
}
