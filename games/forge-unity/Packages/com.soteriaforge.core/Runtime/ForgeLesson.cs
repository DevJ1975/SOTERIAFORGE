using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace SoteriaForge.Core
{
    /// <summary>
    /// Add one of these to the first scene. It connects the build to the Soteria Forge
    /// lesson that launched it and is the only object game code needs to talk to.
    /// Without launch parameters (the Editor) it runs in preview mode and only logs.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class ForgeLesson : MonoBehaviour
    {
        public static ForgeLesson Current { get; private set; }

        [Tooltip("Paste a full launch URL here to test against a real lesson from the Editor.")]
        [SerializeField] private string editorLaunchUrl = "";

        private Cmi5Session _session;

        /// <summary>True when there is no lesson to report to.</summary>
        public bool Preview => _session == null;

        /// <summary>False once the lesson can no longer accept reports.</summary>
        public bool Connected => _session != null && _session.State == SessionState.Active;

        public SessionState State => _session?.State ?? SessionState.NotStarted;

        /// <summary>A message for the learner when the lesson ended early; empty otherwise.</summary>
        public string Problem => _session?.EndReason ?? "";

        public int Pending => _session?.Pending ?? 0;

        private void Awake()
        {
            if (Current != null && Current != this)
            {
                Destroy(gameObject);
                return;
            }
            Current = this;
            DontDestroyOnLoad(gameObject);

            var url = Application.isEditor ? editorLaunchUrl : Application.absoluteURL;
            if (!Cmi5LaunchParams.TryParse(url, out var launch))
            {
                Debug.Log("[Forge] No launch parameters: preview mode, nothing is reported.");
                return;
            }
            _session = new Cmi5Session(
                launch,
                new UnityWebRequestTransport(),
                async seconds => await Awaitable.WaitForSecondsAsync(seconds),
                message => Debug.LogWarning("[Forge] " + message));
            _ = _session.StartAsync();
        }

        public void Completed()
        {
            if (Preview) Debug.Log("[Forge] preview: completed");
            else _session.Completed();
        }

        public void Passed(float scaled)
        {
            if (Preview) Debug.Log($"[Forge] preview: passed {scaled:0.00}");
            else _session.Passed(scaled);
        }

        public void Failed(float scaled)
        {
            if (Preview) Debug.Log($"[Forge] preview: failed {scaled:0.00}");
            else _session.Failed(scaled);
        }

        public void Record(
            string verb,
            string display,
            string objectId = null,
            IDictionary<string, object> extensions = null)
        {
            if (Preview) Debug.Log($"[Forge] preview: {verb}");
            else _session.Record(verb, display, objectId, extensions);
        }

        /// <summary>Call when the learner finishes or leaves. Sends `terminated`.</summary>
        public Task EndAsync() => Preview ? Task.CompletedTask : _session.TerminateAsync();

        private void OnApplicationQuit()
        {
            // Best effort: a browser tab that closes may not let the request finish.
            if (!Preview) _ = _session.TerminateAsync();
        }

        private void OnDestroy()
        {
            if (Current == this) Current = null;
        }
    }
}
