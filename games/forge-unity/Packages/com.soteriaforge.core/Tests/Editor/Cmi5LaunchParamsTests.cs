using NUnit.Framework;

namespace SoteriaForge.Core.Tests
{
    public class Cmi5LaunchParamsTests
    {
        private const string Url =
            "https://games.example.test/sim/index.html?endpoint=https%3A%2F%2Fapi.example.test%2Fapi%2Fstandards%2Fxapi%2F"
            + "&fetch=https%3A%2F%2Fapi.example.test%2Fapi%2Fstandards%2Fcmi5%2Ffetch%2Fabc%2Fsecret"
            + "&actor=%7B%22objectType%22%3A+%22Agent%22%2C+%22account%22%3A+%7B%22name%22%3A+%22m1%22%7D%7D"
            + "&registration=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
            + "&activityId=https%3A%2F%2Fsoteriaforge.com%2Fxapi%2Flessons%2Fl1#top";

        [Test]
        public void ParsesAnEncodedLaunchUrl()
        {
            Assert.IsTrue(Cmi5LaunchParams.TryParse(Url, out var launch));
            Assert.AreEqual("https://api.example.test/api/standards/xapi/", launch.Endpoint);
            Assert.AreEqual("https://api.example.test/api/standards/cmi5/fetch/abc/secret", launch.Fetch);
            Assert.AreEqual("{\"objectType\": \"Agent\", \"account\": {\"name\": \"m1\"}}", launch.Actor);
            Assert.AreEqual("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", launch.Registration);
            Assert.AreEqual("https://soteriaforge.com/xapi/lessons/l1", launch.ActivityId);
        }

        [Test]
        public void AddsTheTrailingSlashTheEndpointNeeds()
        {
            var launch = new Cmi5LaunchParams("https://api.test/xapi", "f", "{}", "r", "a");
            Assert.AreEqual("https://api.test/xapi/", launch.Endpoint);
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase("https://games.example.test/sim/index.html")]
        [TestCase("https://games.example.test/sim/index.html?endpoint=https%3A%2F%2Fapi.test%2F")]
        [TestCase("https://x.test/?endpoint=e&fetch=&actor=a&registration=r&activityId=i")]
        public void RejectsAUrlWithoutEveryParameter(string url)
        {
            Assert.IsFalse(Cmi5LaunchParams.TryParse(url, out var launch));
            Assert.IsNull(launch);
        }
    }
}
