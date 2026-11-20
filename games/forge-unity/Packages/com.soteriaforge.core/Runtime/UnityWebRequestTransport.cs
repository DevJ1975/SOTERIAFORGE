using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace SoteriaForge.Core
{
    /// <summary>UnityWebRequest works on every target, including WebGL (browser fetch).</summary>
    public sealed class UnityWebRequestTransport : IXapiTransport
    {
        public int TimeoutSeconds = 20;

        public async Task<XapiResponse> SendAsync(
            string method, string url, string body, IReadOnlyDictionary<string, string> headers)
        {
            using var request = new UnityWebRequest(url, method);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.timeout = TimeoutSeconds;
            if (body != null)
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                request.SetRequestHeader("Content-Type", "application/json");
            }
            foreach (var header in headers) request.SetRequestHeader(header.Key, header.Value);

            await Awaitable.FromAsyncOperation(request.SendWebRequest());

            if (request.result == UnityWebRequest.Result.ConnectionError
                || request.result == UnityWebRequest.Result.DataProcessingError)
            {
                return new XapiResponse(0, request.error);
            }
            return new XapiResponse(request.responseCode, request.downloadHandler.text);
        }
    }
}
