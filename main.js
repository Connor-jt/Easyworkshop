
import Long from "/DEPENDENCIES/Long.js";


// NOTE: uh
protobuf.load("PROTOGEN/clientserver_login.proto", function(err, root) {
//protobuf.load("test.proto", function(err, root) {
    if (err) throw err;


    // Obtain a message type
    var CMsgHeader_Message = root.lookupType("steamproto.CMsgProtoBufHeader");
    var CMsgLogon_Message = root.lookupType("steamproto.CMsgClientLogon");

    let header = {
        clientSessionid: 0, // NOTE: this gets encoded in steamkit C#, but not this???
        steamid: new Long(0x00000000, 0x01100001) // 0x0110000100000000
    };
    let logon = {
        obfuscatedPrivateIp: {v4: 0x45520FF2}, // 0xffffffff ^ 0xBAADF00D,
        deprecatedObfustucatedPrivateIp: 0x45520FF2,
        accountName: STATIC_USERNAME,
        password: STATIC_PASSWORD,
        shouldRememberPassword: false,
        protocolVersion: 0x0001002c,
        clientOsType: 0x00000010,
        clientLanguage: "english",
        cellId: 0,
        steam2TicketRequest: false,
        clientPackageVersion: 1771,
        supportsRateLimitResponse: true,
        machineName: "DESKTOP-B2FH41Q (SteamKit2)",
        //machine_id: HardwareUtils.GetMachineID( Client.Configuration.MachineInfoProvider ) // pretty sure we cant complete this via browser APIs (NOTE: 0x9b bytes is what we'd usually get from this)
    };
    let serialized = SerializePacket([0x8A,0x15,0x0,0x80], header, CMsgHeader_Message, logon, CMsgLogon_Message);
    console.log(serialized.length);
    console.log(serialized);
});

function SerializePacket(msg_sig, header, headerproto, body, bodyproto){

    let header_bytes = proto_serialize(header, headerproto);
    let body_bytes = proto_serialize(body, bodyproto);

    let total_packet_size = 8 + header_bytes.length + body_bytes.length;

    let packet_buffer = new Uint8Array(new ArrayBuffer(total_packet_size));
    packet_buffer.set(msg_sig);
    packet_buffer.set(int_to_4byte(header_bytes.length), 4);
    packet_buffer.set(header_bytes, 8);
    packet_buffer.set(body_bytes, 8 + header_bytes.length);

    var decomp_body = bodyproto.toObject(bodyproto.decode(body_bytes), {
        enums: String,  // enums as string names
        longs: String,  // longs as strings (requires long.js)
        bytes: String,  // bytes as base64 encoded strings
        defaults: true, // includes default values
        arrays: true,   // populates empty arrays (repeated fields) even if defaults=false
        objects: true,  // populates empty objects (map fields) even if defaults=false
        oneofs: true    // includes virtual oneof fields set to the present field's name
    });
    console.log(body);
    console.log(decomp_body);

    return packet_buffer;
}
function proto_serialize(payload, proto){
    let errMsg = proto.verify(payload)
    if (errMsg) throw Error("proto issue: "+errMsg);

    let result = proto.encode(proto.create(payload)).finish();
    console.log(result);
    return result;
}
function int_to_4byte(num){ // encodes to little endian!!!
    return [(num & 0x000000ff), (num & 0x0000ff00) >> 8, (num & 0x00ff0000) >> 16, (num & 0xff000000) >> 24];
}



function DeserializePacket(){

    var message = AwesomeMessage.decode(buffer);
    // Maybe convert the message back to a plain object
    var object = AwesomeMessage.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
    });
}



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
// const ClientHello_packet = [ 0x4D, 0x26, 0x00, 0x80,  0x00, 0x00, 0x00, 0x00,  0x08, 0xAC, 0x80, 0x04];
// const ClientHello_view = new Uint8Array(new ArrayBuffer(ClientHello_packet.length));
// ClientHello_view.set(ClientHello_packet);


// let custom_input_server = "cmp1-vie1.steamserver.net:27018";
// let WSS_SERVER = "wss://"+custom_input_server+"/cmsocket/";
// // const ws = new WebSocket(WSS_SERVER)
// ws.onopen = () => {
//     console.log('ws opened')
//     ws.send(ClientHello_view) // HELLO PACKET
//     ws.send() // LOGON PACKET
// }

// ws.onmessage = (message) => {
//     console.log(`message received`, message.data)
//     // process message for type
// }



// ws.onerror = (event) =>{
//     console.log('ws error')
// }
// ws.onclose = (event) =>{
//     console.log('ws closed')
// }














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