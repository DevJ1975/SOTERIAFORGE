using System;
using System.Collections.Generic;

namespace SoteriaForge.Core
{
    /// <summary>The cmi5 launch parameters Soteria Forge appends to the content URL.</summary>
    public sealed class Cmi5LaunchParams
    {
        public string Endpoint { get; }
        public string Fetch { get; }
        public string Actor { get; }
        public string Registration { get; }
        public string ActivityId { get; }

        public Cmi5LaunchParams(
            string endpoint, string fetch, string actor, string registration, string activityId)
        {
            Endpoint = endpoint.EndsWith("/", StringComparison.Ordinal) ? endpoint : endpoint + "/";
            Fetch = fetch;
            Actor = actor;
            Registration = registration;
            ActivityId = activityId;
        }

        /// <summary>
        /// Reads the parameters from a launch URL. Returns false when any is missing,
        /// which is the normal case in the Editor.
        /// </summary>
        public static bool TryParse(string url, out Cmi5LaunchParams launch)
        {
            launch = null;
            if (string.IsNullOrEmpty(url)) return false;
            var question = url.IndexOf('?');
            if (question < 0) return false;
            var query = url.Substring(question + 1);
            var hash = query.IndexOf('#');
            if (hash >= 0) query = query.Substring(0, hash);

            var values = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var pair in query.Split('&'))
            {
                if (pair.Length == 0) continue;
                var equals = pair.IndexOf('=');
                var key = Decode(equals < 0 ? pair : pair.Substring(0, equals));
                values[key] = equals < 0 ? "" : Decode(pair.Substring(equals + 1));
            }

            string Get(string key) =>
                values.TryGetValue(key, out var value) && value.Length > 0 ? value : null;

            var endpoint = Get("endpoint");
            var fetch = Get("fetch");
            var actor = Get("actor");
            var registration = Get("registration");
            var activityId = Get("activityId");
            if (endpoint == null || fetch == null || actor == null
                || registration == null || activityId == null)
            {
                return false;
            }
            launch = new Cmi5LaunchParams(endpoint, fetch, actor, registration, activityId);
            return true;
        }

        // Browsers encode a space in a query string as '+'.
        private static string Decode(string value) =>
            Uri.UnescapeDataString(value.Replace('+', ' '));
    }
}
