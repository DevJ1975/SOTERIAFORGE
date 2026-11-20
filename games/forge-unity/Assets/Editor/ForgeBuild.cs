using System.IO;
using SoteriaForge.Core;
using SoteriaForge.Drill;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SoteriaForge.EditorTools
{
    /// <summary>Batch-mode entry points: `-executeMethod SoteriaForge.EditorTools.ForgeBuild.X`.</summary>
    public static class ForgeBuild
    {
        private const string DrillScene = "Assets/Scenes/LockoutDrill.unity";

        [MenuItem("Soteria Forge/Create Drill Scene")]
        public static void CreateDrillScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camera = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            camera.tag = "MainCamera";
            var view = camera.GetComponent<Camera>();
            view.clearFlags = CameraClearFlags.SolidColor;
            view.backgroundColor = new Color(0.11f, 0.12f, 0.14f);

            new GameObject("Forge Lesson", typeof(ForgeLesson));
            new GameObject("Lockout Drill", typeof(LockoutDrill));

            EditorSceneManager.SaveScene(scene, DrillScene);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(DrillScene, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("[Forge] Drill scene created: " + DrillScene);
        }

        [MenuItem("Soteria Forge/Build WebGL")]
        public static void BuildWebGL()
        {
            if (!File.Exists(DrillScene)) CreateDrillScene();
            // Hosts that cannot send Content-Encoding headers still load the build.
            PlayerSettings.WebGL.decompressionFallback = true;
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { DrillScene },
                locationPathName = "Builds/WebGL",
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            });
            var summary = report.summary;
            Debug.Log($"[Forge] WebGL build {summary.result}: {summary.totalSize / 1048576f:0.0} MB");
            if (summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                EditorApplication.Exit(1);
            }
        }
    }
}
