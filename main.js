// NOTE: uh
protobuf.load("awesome.proto", function(err, root) {
    if (err) throw err;

    // Obtain a message type
    var AwesomeMessage = root.lookupType("awesomepackage.AwesomeMessage");

    // Exemplary payload
    var payload = { awesomeField: "AwesomeString" };

    // Verify the payload if necessary (i.e. when possibly incomplete or invalid)
    var errMsg = AwesomeMessage.verify(payload);
    if (errMsg) throw Error(errMsg);

    // Create a new message
    var message = AwesomeMessage.create(payload);

    var buffer = AwesomeMessage.encode(message).finish();

    var message = AwesomeMessage.decode(buffer);


    // Maybe convert the message back to a plain object
    var object = AwesomeMessage.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
        // see ConversionOptions
    });
});




// NOTE: SOURCED FROM STEAMKIT2 (will add relevant links later)




// -----------------------------------------------------------------------------------------------------------------------------------------
// -- BEGIN: actual javascript
// -----------------------------------------------------------------------------------------------------------------------------------------
//  ## REQUEST SERVERS ##
    //const url = "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?format=vdf&cellid=0";
    // const url = "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/";//?format=vdf&cellid=0";
    // async function THING() {
        
    //     const response = await fetch(url);
    //     const jsonData = await response.json();
    // }
//
//THING();





//                         [ PROTOCOL                 HEADER SIZE              BODY (PRE-SERIALIZED) ]
const ClientHello_packet = [ 0x4D, 0x26, 0x00, 0x80,  0x00, 0x00, 0x00, 0x00,  0x08, 0xAC, 0x80, 0x04];
const ClientHello_view = new Uint8Array(new ArrayBuffer(ClientHello_packet.length));
ClientHello_view.set(ClientHello_packet);


let custom_input_server = "cmp1-vie1.steamserver.net:27018";
let WSS_SERVER = "wss://"+custom_input_server+"/cmsocket/";
const ws = new WebSocket(WSS_SERVER)
ws.onopen = () => {
    console.log('ws opened')
    ws.send(ClientHello_view) // HELLO PACKET
    ws.send() // LOGON PACKET
}

ws.onmessage = (message) => {
    console.log(`message received`, message.data)
    // process message for type
}



ws.onerror = (event) =>{
    console.log('ws error')
}
ws.onclose = (event) =>{
    console.log('ws closed')
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