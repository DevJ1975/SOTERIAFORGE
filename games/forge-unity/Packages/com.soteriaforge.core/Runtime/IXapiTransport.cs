using System.Collections.Generic;
using System.Threading.Tasks;

namespace SoteriaForge.Core
{
    /// <summary>Status 0 means the request never reached the server.</summary>
    public readonly struct XapiResponse
    {
        public readonly long Status;
        public readonly string Body;

        public XapiResponse(long status, string body)
        {
            Status = status;
            Body = body ?? "";
        }

        public bool Ok => Status >= 200 && Status < 300;
    }

    /// <summary>HTTP as the session needs it, so tests can run without a network.</summary>
    public interface IXapiTransport
    {
        Task<XapiResponse> SendAsync(
            string method, string url, string body, IReadOnlyDictionary<string, string> headers);
    }
}
