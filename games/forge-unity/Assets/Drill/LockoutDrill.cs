using System.Collections.Generic;
using SoteriaForge.Core;
using UnityEngine;

namespace SoteriaForge.Drill
{
    /// <summary>
    /// Pipeline test scenario, not training content: put six lockout/tagout steps in
    /// order. It exists to prove launch, reporting and completion end to end, and is
    /// deliberately plain (IMGUI, no art).
    /// </summary>
    public sealed class LockoutDrill : MonoBehaviour
    {
        // Shown to the learner at the end. The score that counts is the server's replay
        // of the action log against lockout-drill.scenario.json, which uses these numbers.
        private const float PassMark = 0.8f;
        private const float PenaltyPerMistake = 0.2f;

        // The order taught for hazardous-energy control (OSHA 29 CFR 1910.147).
        private static readonly string[] Steps =
        {
            "Notify affected employees",
            "Shut down the equipment",
            "Isolate every energy source",
            "Apply locks and tags",
            "Release stored energy",
            "Verify isolation: try to start",
        };

        // Step ids in lockout-drill.scenario.json, in the same order as `Steps`.
        private static readonly string[] StepIds =
        {
            "notify", "shutdown", "isolate", "lock-tag", "release", "verify",
        };

        // Shown shuffled, in a fixed order so every learner sees the same drill.
        private static readonly int[] Display = { 3, 0, 5, 2, 4, 1 };

        private readonly HashSet<int> _done = new HashSet<int>();
        private int _next;
        private int _mistakes;
        private string _feedback = "Choose the first step.";
        private bool _finished;
        private bool _passed;
        private float _score;

        private void OnGUI()
        {
            var scale = Mathf.Max(1f, Screen.height / 540f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
            var width = Screen.width / scale;
            GUILayout.BeginArea(new Rect(24, 16, width - 48, Screen.height / scale - 32));

            GUILayout.Label("Lockout / tagout drill");
            GUILayout.Label("Select the steps in the order you would carry them out.");
            GUILayout.Space(8);

            foreach (var index in Display)
            {
                GUI.enabled = !_finished && !_done.Contains(index);
                var label = _done.Contains(index)
                    ? $"{StepNumber(index)}. {Steps[index]}"
                    : Steps[index];
                if (GUILayout.Button(label, GUILayout.Height(36))) Choose(index);
            }
            GUI.enabled = true;

            GUILayout.Space(8);
            GUILayout.Label(_feedback);
            GUILayout.Label(Status());
            if (_finished && !_passed && GUILayout.Button("Close", GUILayout.Height(36)))
            {
                _feedback = "Open the lesson again from the course to retry.";
            }
            GUILayout.EndArea();
        }

        private int StepNumber(int index) => index + 1;

        private void Choose(int index)
        {
            var lesson = ForgeLesson.Current;
            lesson?.Perform(StepIds[index]);
            if (index != _next)
            {
                _mistakes++;
                _feedback = "Not yet. Something has to happen before that step.";
                lesson?.Record("chose-out-of-order", "chose out of order", null,
                    new Dictionary<string, object>
                    {
                        ["https://soteriaforge.com/xapi/extensions/step"] = Steps[index],
                    });
                return;
            }

            _done.Add(index);
            _next++;
            _feedback = _next < Steps.Length ? "Correct. What comes next?" : "";
            lesson?.Record("performed-step", "performed step", null,
                new Dictionary<string, object>
                {
                    ["https://soteriaforge.com/xapi/extensions/step"] = Steps[index],
                });
            if (_next == Steps.Length) Finish(lesson);
        }

        private void Finish(ForgeLesson lesson)
        {
            _finished = true;
            _score = Mathf.Max(0f, 1f - _mistakes * PenaltyPerMistake);
            _passed = _score >= PassMark;
            _feedback = _passed
                ? $"Passed with {_score:P0}. You can close this lesson."
                : $"Score {_score:P0}. The pass mark is {PassMark:P0}.";
            if (lesson == null) return;
            if (_passed)
            {
                lesson.Completed();
                lesson.Passed(_score);
            }
            else
            {
                // No `completed`: a failed attempt must not complete the lesson.
                lesson.Failed(_score);
            }
            _ = lesson.EndAsync();
        }

        private static string Status()
        {
            var lesson = ForgeLesson.Current;
            if (lesson == null || lesson.Preview) return "Preview: results are not being saved.";
            if (lesson.Problem.Length > 0) return lesson.Problem;
            return lesson.Pending > 0 ? "Saving your progress..." : "Progress saved.";
        }
    }
}
