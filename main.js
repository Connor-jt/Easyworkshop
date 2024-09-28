
// NOTE: SOURCED FROM STEAMKIT2 (will add relevant links later)




// -----------------------------------------------------------------------------------------------------------------------------------------
// -- BEGIN: actual javascript
// -----------------------------------------------------------------------------------------------------------------------------------------
//  ## REQUEST SERVERS ##
    //const url = "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?format=vdf&cellid=0";
    const url = "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/";//?format=vdf&cellid=0";
    async function THING() {
        
        const response = await fetch(url);
        const jsonData = await response.json();
    }
//
THING();

var WSS_SERVER = "wss://cmp1-vie1.steamserver.net:27018/cmsocket/";
const ws = new WebSocket('ws://localhost:3000')
ws.onopen = () => {
  console.log('ws opened on browser')
  ws.send('hello world')
}

ws.onmessage = (message) => {
  console.log(`message received`, message.data)
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -- RELEVANT CODE SNIPPETS --
// -----------------------------------------------------------------------------------------------------------------------------------------

/* ## HTTP CLIENT ##
    var client = new HttpClient();

    // assemblyVersion = "3.0.0"
    //var assemblyVersion = typeof(SteamConfiguration).Assembly.GetName().Version?.ToString(fieldCount: 3) ?? "UnknownVersion";
    client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("SteamKit", assemblyVersion));
    return client;
*/
/* ## BASIC HTTP INFO ##
    client.BaseAddress = config.WebAPIBaseAddress; // https://api.steampowered.com/ // port 0x1bb
    client.Timeout = WebAPI.DefaultTimeout; // 100 seconds
*/
/*  ## HTTP QUERY FOR STEAM SERVERS ##
    // "cellid" = 0
    // "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?format=vdf&cellid=0"
    var response = await httpClient.SendAsync( request ).ConfigureAwait( false );
*/
/*  ## SORTING ENDPOINTS TO LIST ##
    "websockets" => ServerRecord.CreateWebSocketServer( endpoint ),
    "netfilter" => ServerRecord.CreateDnsSocketServer( endpoint ),
*/
/*  ## SORTING FOR BEST SERVER ##
    var result = servers
    .Where( o => o.Protocol.HasFlagsFast( supportedProtocolTypes ) )
    .Select( static ( server, index ) => (Server: server, Index: index) )
    .OrderBy( static o => o.Server.LastBadConnectionTimeUtc.GetValueOrDefault() )
    .ThenBy( static o => o.Index )
    .Select( static o => o.Server )
    .FirstOrDefault();
*/


/*  ## CONNECTING TO A STEAM WEBSOCKET SERVER ##
    // cmp1-vie1.steamserver.net:27018
    // wss://cmp1-vie1.steamserver.net:27018/cmsocket/
    await socket.ConnectAsync(connectionUri, combinedCancellation.Token).ConfigureAwait(false);
*/
/*  ## STEP1 CLIENT HELLO PROTOCOL ##
    // | PROTOCOL    | HEADER SIZE | BODY????    |
    // | 4D 26 00 80 | 00 00 00 00 | 08 AC 80 04 |
    await socket.SendAsync(data, WebSocketMessageType.Binary, true, cts.Token).ConfigureAwait(false);
*/