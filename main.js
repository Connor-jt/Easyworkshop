
import Long from "/DEPENDENCIES/Long.js";


// NOTE: uh
var CMsgHeader_Message = null;
var CMsgLogon_Message = null;
var CMsgMulti_Message = null;
var CMsgClientLogonResponse_Message = null;
protobuf.load("PROTOGEN/clientserver_login.proto", function(err, root) {
    if (err) throw err;
    CMsgHeader_Message = root.lookupType("steamproto.CMsgProtoBufHeader");
    CMsgLogon_Message = root.lookupType("steamproto.CMsgClientLogon");
    CMsgMulti_Message = root.lookupType("steamproto.CMsgMulti");
    CMsgClientLogonResponse_Message = root.lookupType("steamproto.CMsgClientLogonResponse");

    init_steam_connection();
});


//                         [ PROTOCOL                 HEADER SIZE              BODY (PRE-SERIALIZED) ]
const ClientHello_packet = [ 0x4D, 0x26, 0x00, 0x80,  0x00, 0x00, 0x00, 0x00,  0x08, 0xAC, 0x80, 0x04];
const ClientHello_view = new Uint8Array(new ArrayBuffer(ClientHello_packet.length));
ClientHello_view.set(ClientHello_packet);
function Steam_SendHello(){
    WS.send(ClientHello_view)
}

function Steam_SendLogon(){
    let header = {
        clientSessionid: 0,
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
    WS.send(serialized)
    console.log("logon sent!!!")
}
function Steam_SendHeartbeat(){

}
function Steam_SendWorkshopQuery(){

}

function Steam_RecieveLogon(){

}

function SerializePacket(msg_sig, header, headerproto, body, bodyproto){
    let header_bytes = proto_serialize(header, headerproto);
    let body_bytes = proto_serialize(body, bodyproto);

    let total_packet_size = 8 + header_bytes.length + body_bytes.length;

    let packet_buffer = new Uint8Array(new ArrayBuffer(total_packet_size));
    packet_buffer.set(msg_sig);
    packet_buffer.set(int_to_4byte(header_bytes.length), 4);
    packet_buffer.set(header_bytes, 8);
    packet_buffer.set(body_bytes, 8 + header_bytes.length);

    return packet_buffer;
}
function proto_serialize(payload, proto){
    let errMsg = proto.verify(payload)
    if (errMsg) throw Error("proto issue: "+errMsg);

    let result = proto.encode(proto.create(payload)).finish();
    return result;
}
function int_to_4byte(num){ // encodes to little endian!!!
    return [(num & 0x000000ff), (num & 0x0000ff00) >> 8, (num & 0x00ff0000) >> 16, (num & 0xff000000) >> 24];
}
function typedArrayToBuffer(array) {
    return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset)
}
async function concatUint8Arrays(uint8arrays) {
    const blob = new Blob(uint8arrays);
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
}


async function DeserializePacket(buffer){
    if (buffer.length < 4) throw "recieved packet too small to contain any information!!";
    
    let dataView = new DataView(typedArrayToBuffer(buffer));

    // Read the first Uint32 value (4 bytes)
    let message_type = dataView.getUint32(0, true);
    let is_proto = message_type >>> 31;
    message_type &= 0x7fffffff;
    


    // custom header ???
    if (message_type == 1303 || message_type == 1304 || message_type == 1305){
        //EMsg.ChannelEncryptRequest EMsg.ChannelEncryptResponse EMsg.ChannelEncryptResult:
        console.log("recieved packet that we aren't supposed to read??");
        return null;
    } 

    let read_position = 4;
    let HeaderSize = 0;
    let header_object = null;

    // if proto header 
    if (is_proto == 1){
        read_position += 4;
        HeaderSize = dataView.getUint32(4, true); 
        // Maybe convert the message back to a plain object
        header_object = proto_deserialize(buffer.subarray( 8, 8 + HeaderSize), CMsgHeader_Message);
    } else { // otherwise struct header (NOTE: probably not used but steamkit has this so) // WARNING: names have not been matched up, so consider this NOT-IN-USE
        //throw "packet had non-proto header!! currently unsupported!!!"
        console.log("recieved non-proto packet, type: " + enum_dict[message_type]);
        // read_position += 1;
        // HeaderSize = dataView.getUint8(4);
        // header_object = {
        //     HeaderVersion: dataView.getUint16(5, true), // 2
        //     TargetJobID:   dataView.getBigUint64(7, true), // 8
        //     SourceJobID:   dataView.getBigUint64(15, true), // 8
        //     HeaderCanary:  dataView.getUint8(23), // 1
        //     steamid:       dataView.getBigUint64(24, true), // 8
        //     SessionID:     dataView.getInt32(32, true) // 4
        // };
        // console.log("static packet header size: " + HeaderSize);
        // console.log(header_object);
        return;
    }
    read_position += HeaderSize;

    console.log("recieved packet, type: " + enum_dict[message_type]+ ", proto: " + is_proto);


    // deserialize body??
    if        (message_type == 1){ // Multi
        let multi_obj = proto_deserialize(buffer.subarray(read_position), CMsgMulti_Message);
        let multi_buf = null;

        if (multi_obj.sizeUnzipped != undefined && multi_obj.sizeUnzipped > 0){
            // Convert the bytes to a stream.
            const stream = new Blob([multi_obj.messageBody]).stream();
            const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
            
            // Read all the bytes from this stream.
            const chunks = [];
            for await (const chunk of decompressedStream) { chunks.push(chunk); }
            multi_buf = await concatUint8Arrays(chunks);
        } else {
            multi_buf = multi_obj.messageBody;
        }

        read_position = 0;
        while (read_position+4 <= multi_buf.length){
            // read bundle length
            let chunk_length = multi_buf[read_position] | (multi_buf[read_position+1] << 8) | (multi_buf[read_position+2] << 16) | (multi_buf[read_position+3] << 24);
            read_position += 4;
            if (read_position+chunk_length > multi_buf.length)
                throw "trying to read multi chunk out of bounds!!";

            try{await DeserializePacket(multi_buf.subarray(read_position, read_position + chunk_length));
            } catch (ex){ console.log("caught error while processing multi:" + ex);}
            
            read_position += chunk_length;
        }
        if (read_position != multi_buf.length){
            console.log("leftover bytes from reading multi packet: " + read_position +", "+ multi_buf.length)
        }

    } else if (message_type == 751){ // ClientLogOnResponse
        let response_obj = proto_deserialize(buffer.subarray(read_position), CMsgClientLogonResponse_Message);
        console.log(response_obj);
    } else if (message_type == 757){ // ClientLoggedOff 

    } else if (message_type == 5500){ // ClientServerUnavailable 

    } else if (message_type == 783){ // ClientCMList

    } else if (message_type == 850){ // ClientSessionToken

    } else if (message_type == 146){ // ServiceMethod

    } else if (message_type == 147){ // ServiceMethodResponse

    }

    return;
}
function proto_deserialize(buffer, proto){
    return proto.toObject(proto.decode(buffer), {
        longs: String,
        enums: String,
        //bytes: String, // default enocdes them into uint8arrays, why would we want anything other than that ??????????
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


var WS = null;
function init_steam_connection(){
    let custom_input_server = "cmp1-vie1.steamserver.net:27018";

    let WSS_SERVER = "wss://"+custom_input_server+"/cmsocket/";
    WS = new WebSocket(WSS_SERVER)
    WS.onopen = () => {
        console.log('WS opened')
        Steam_SendHello();
        Steam_SendLogon();
    }

    WS.onmessage = (message) => {
        console.log("packet recieved!!")

        if (message.data instanceof ArrayBuffer){
            DeserializePacket(messagmessage.data);

        } else if (message.data instanceof Blob){
            var fileReader = new FileReader();
            fileReader.onload = function(event) {
                let arrayBufferNew = event.target.result;
                let uint8ArrayNew  = new Uint8Array(arrayBufferNew);

                DeserializePacket(uint8ArrayNew);
            };
            fileReader.readAsArrayBuffer(message.data);

        } else if (typeof message.data === "string"){
            console.log("packet recieved that was just a string???")
            console.log(message.data)
        }
    }



    WS.onerror = (event) =>{
        console.log('WS error')
    }
    WS.onclose = (event) =>{
        console.log('WS closed')
    }
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



