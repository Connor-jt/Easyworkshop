import Long from "/DEPENDENCIES/Long.js";

var WS = null; // our websocket handle to the steam servers
var logon_session_header = null;
var logon_session_details = null; // contains the response data from our username+password logon (steam ID etc)
// ---------------------------------------------------------------------------------------------------------------------------
// #region DISCONNECT
    function disconnect(reason = null) {
        let log;
        if (reason != null) log = "Connection closed: " + reason;
        else                log = "Connection closed.";
        console.log(log);
        print(log);

        logon_session_header = null;
        logon_session_details = null; 
        switch_page(LOGIN_PAGE);

        Heartbeat_Stop(); 
        if (WS!=null){
            if (WS.readyState !== WebSocket.CLOSED && WS.readyState !== WebSocket.CLOSED) WS.close();
            WS = null;
        } 
    }
//#endregion -----------------------------------------------------------------------------------------------------------------



// STEAM API RELATED SECTIONS //

// ---------------------------------------------------------------------------------------------------------------------------
// #region STEAM TIME FUNCTIONS
    function steam_time_now(){
        return date_to_steam_date(new Date());
    }
    function date_to_steam_date(date){
        return Math.floor((date.getTime() - steam_zero_date()) / 1000);
    }
    function steam_zero_date(){
        return new Date(2005, 1, 1, 0, 0, 0, 0).getTime();
    }
    function steam_date_to_date(steam_date){
        return new Date((steam_zero_date() + steam_date) * 1000);
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region UTILITY FUNCTIONS
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
    function short_string_number(num){
        if (typeof num === 'undefined' || num === null) return "NULL"; 

        if (num < 1000){ return Math.round(num).toString(); } 
        else if (num < 1000000){ return Math.round(num/1000) + "K"; } 
        else if (num < 1000000000){ return Math.round(num/1000000) + "M"; } 
        else { return Math.round(num/1000000000) + "B"; } 
    }
    function short_string_number_bytes(){
        if (typeof num === 'undefined' || num === null) return "NULL"; 

        if (num < 1000){ return Math.round(num).toString(); } 
        else if (num < 1000000){ return Math.round(num/1000) + "kb"; } 
        else if (num < 1000000000){ return Math.round(num/1000000) + "mb"; } 
        else { return Math.round(num/1000000000) + "gb"; } 
    }
    // annoying time functions
    function getMonday(d) {
        d = new Date(d);
        var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1); // adjust when day is sunday
        return new Date(d.setDate(diff));
    }
    function getMonthday(d){
        return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    function getYearday(d){
        return new Date(d.getFullYear(), 0, 1);
    }
    function formatDate(date) {
        const day = date.toLocaleString('default', { day: '2-digit' });
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.toLocaleString('default', { year: 'numeric' });
        return day + '-' + month + '-' + year;
    }
    // more annoying time functions
    function toUnixTimestamp(date){
        return Math.floor(date.getTime() / 1000)
    }
    function fromUnixTimestamp(unix_timestamp){
        return new Date(unix_timestamp * 1000);
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region PROTOBUF INIT
    protobuf.util.Long = Long;
    protobuf.configure();

    var CMsgHeader_Message = null;
    var CMsgLogon_Message = null;
    var CMsgMulti_Message = null;
    var CMsgClientLogonResponse_Message = null;
    var CPublishedFile_QueryFiles_Message = null;
    var CPublishedFile_QueryFilesResponse_Message = null;
    protobuf.load("PROTOGEN/clientserver_login.proto", function(err, root) {
        if (err) throw err;
        CMsgLogon_Message = root.lookupType("steamproto.CMsgClientLogon");
        CMsgMulti_Message = root.lookupType("steamproto.CMsgMulti");
        CMsgClientLogonResponse_Message = root.lookupType("steamproto.CMsgClientLogonResponse");
        CPublishedFile_QueryFiles_Message = root.lookupType("steamproto.CPublishedFile_QueryFiles_Request");
        CPublishedFile_QueryFilesResponse_Message = root.lookupType("steamproto.CPublishedFile_QueryFiles_Response");
        CMsgHeader_Message = root.lookupType("steamproto.CMsgProtoBufHeader");
    });
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region PROTOBUF UTILITY FUNCTIONS
    var job_index = 0;
    function MakeJobid(){
        job_index += 1;
        // 20 bits, job index, 30 bits, timestamp (seconds since 2005), 4 bits, processid, 10 bits, boxid
        //let packed_seconds = (steam_time_now() & 0x3FFFFFFF) << 20;
        let packed_seconds = (steam_time_now() & 0x3FFFFFFF) * 0x100000; // this doesn't truncate it to like 32bits
        
        console.log("packed seconds");
        console.log(packed_seconds);
        return (packed_seconds + (job_index & 0xfffff));
    }
    function SerializePacket(msg_sig, header, headerproto, body = undefined, bodyproto = undefined){
        let header_bytes = proto_serialize(header, headerproto);
        let body_bytes;
        if (body != undefined) body_bytes = proto_serialize(body, bodyproto);
        else                   body_bytes = [];

        let total_packet_size = 8 + header_bytes.length + body_bytes.length;
    
        let packet_buffer = new Uint8Array(new ArrayBuffer(total_packet_size));
        packet_buffer.set(msg_sig);
        packet_buffer.set(int_to_4byte(header_bytes.length), 4);
        packet_buffer.set(header_bytes, 8);
        if (body != undefined)
            packet_buffer.set(body_bytes, 8 + header_bytes.length);
    
        return packet_buffer;
    }
    function proto_serialize(payload, proto){
        let errMsg = proto.verify(payload)
        if (errMsg) throw Error("proto issue: "+errMsg);
    
        let result = proto.encode(proto.create(payload)).finish();
        return result;
    }
    function proto_deserialize(buffer, proto){
        return proto.toObject(proto.decode(buffer), {
            longs: Long,
            enums: String,
            //bytes: String, // default enocdes them into uint8arrays, why would we want anything other than that ??????????
        });
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region PROTOBUF MESSAGES
    function Steam_SendHello(){
        //static preserialized msg [ PROTOCOL                 HEADER SIZE              BODY (PRE-SERIALIZED) ]
        const ClientHello_packet = [ 0x4D, 0x26, 0x00, 0x80,  0x00, 0x00, 0x00, 0x00,  0x08, 0xAC, 0x80, 0x04];
        const ClientHello_view = new Uint8Array(new ArrayBuffer(ClientHello_packet.length));
        ClientHello_view.set(ClientHello_packet);
        WS.send(ClientHello_view)
    }
    function Steam_SendLogon(username, password){
        let header = {
            clientSessionid: 0,
            steamid: new Long(0x00000000, 0x01100001) // 0x0110000100000000
        };
        let logon = {
            obfuscatedPrivateIp: {v4: 0x45520FF2}, // 0xffffffff ^ 0xBAADF00D,
            deprecatedObfustucatedPrivateIp: 0x45520FF2,
            accountName: username,
            password: password,
            shouldRememberPassword: false,
            protocolVersion: 0x0001002c,
            clientOsType: 0x00000010,
            clientLanguage: "english",
            cellId: 0,
            steam2TicketRequest: false,
            clientPackageVersion: 1771,
            supportsRateLimitResponse: true,
            machineName: "Easyworkshop - " + username,
            //machine_id: HardwareUtils.GetMachineID( Client.Configuration.MachineInfoProvider ) // pretty sure we cant complete this via browser APIs (NOTE: 0x9b bytes is what we'd usually put in this)
        };
        let serialized = SerializePacket([0x8A,0x15,0x0,0x80], header, CMsgHeader_Message, logon, CMsgLogon_Message);
        WS.send(serialized);
        console.log("logon sent!!!");
    }
    function Steam_SendWorkshopQuery(app_id, sort_by, page_index, search_text = null){ // returns jobid
        let jobid = MakeJobid();
        console.log(jobid);
        let header = {
            targetJobName: "PublishedFile.QueryFiles#1",
            jobidSource: jobid
        };
        let query = {
            appid: app_id, 
            numperpage: MODS_PER_PAGE,
            page: page_index,
            queryType: sort_by, 
            //dateRangeCreated: {timestampStart: date_to_steam_date(new Date()), timestampEnd: steam_time_now()},
            // NOTE: none of these flags seem to do anything???? except having at least 1 active, which forces us to recieve all the data or something
            returnPreviews: true,
            returnVoteData:true, // this one does seem to impact the vote data that we recieve at least
            //returnDetails: true,
            // returnTags:true, returnKvTags:true, , // not useful for our broad search??
            // returnShortDescription:true, returnPlaytimeStats:1, // probably not useful?
            // return_for_sale_data:true, return_metadata:true, return_short_description:true, return_reactions:true, // none of these do anything??
        };
        console.log(query);
        // add in our search filter if we have one
        if (search_text != null) query.searchText = search_text;
        // add our day filter if we have one
        if (filter_date_type != NO_DATE && filter_start_date != null){
            let last_date = new Date(filter_start_date); 
            if      (filter_date_type == YEAR ){ last_date.setFullYear( last_date.getFullYear() + 1 ); } 
            else if (filter_date_type == MONTH){ last_date.setMonth(    last_date.getMonth()    + 1 ); } 
            else if (filter_date_type == WEEK ){ last_date.setDate(     last_date.getDate()     + 7 ); } 
            else if (filter_date_type == DAY  ){ last_date.setDate(     last_date.getDate()     + 1 ); } 
            query.dateRangeCreated = {timestampStart: toUnixTimestamp(filter_start_date), timestampEnd: toUnixTimestamp(last_date)};
        }  

        let serialized = SerializePacket([0x97, 0x00, 0x00, 0x80], header, CMsgHeader_Message, query, CPublishedFile_QueryFiles_Message);
        WS.send(serialized);
        return jobid.toString();
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region PROTOBUF RECIEVE MESSAGES
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
            if (response_obj.eresult == 1){
                logon_session_header = header_object;
                logon_session_details = response_obj;
                console.log(header_object);
                console.log(response_obj);
                switch_page(BROWSE_PAGE);
                print("successfully logged in!", true);
                Heartbeat_Start(logon_session_details.legacyOutOfGameHeartbeatSeconds);
            } else {
                disconnect("login failed with code: " + response_obj.eresult);
            }
        } else if (message_type == 757){ // ClientLoggedOff 
            disconnect("Client was logged off");
        } else if (message_type == 5500){ // ClientServerUnavailable 
            disconnect("Servers said to be unavailable");
        } else if (message_type == 783){ // ClientCMList

        } else if (message_type == 850){ // ClientSessionToken

        } else if (message_type == 146){ // ServiceMethod

        } else if (message_type == 147){ // ServiceMethodResponse
            // mod query response
            if (header_object.targetJobName === "PublishedFile.QueryFiles#1"){
                let response_obj = proto_deserialize(buffer.subarray(read_position), CPublishedFile_QueryFilesResponse_Message);
                console.log(header_object);
                console.log(response_obj);
                if (response_obj.total > 0){
                    console.log(header_object.jobidTarget);
                    ingest_mod_list(response_obj, header_object.jobidTarget.toString());
                    print("recieved query response!!", true);
                } else {
                    print("recieved query response with no erntries", false);
                    ingest_mod_list({publishedfiledetails:[], total:0}, header_object.jobidTarget.toString());
                }
            }
        }

        return;
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region STEAM HEARTBEAT
    var heartbeater = null;
    function Heartbeat_Start(interval_seconds){
        heartbeater = setInterval(Heartbeat, interval_seconds * 1000)
    }
    function Heartbeat_Stop(){
        if (heartbeater != null){
            clearInterval(heartbeater)
            heartbeater = null;
        }
    }
    function Heartbeat(){
        let header = {
            clientSessionid: logon_session_header.clientSessionid,
            steamid: logon_session_header.steamid
        };
        try{
            let serialized = SerializePacket([0xBF,0x2,0x0,0x80], header, CMsgHeader_Message);
            WS.send(serialized);
            console.log("heartbeat");
        } catch (ex){
            console.log("heartbeat fail: " + ex);
        }
    }

//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region WEBSOCKET CONNECTION
    function init_steam_connection(username, password){
        if (CMsgHeader_Message == null) throw "protobuf hasn't init yet!!";

        let custom_input_server = "cmp1-vie1.steamserver.net:27018";

        let WSS_SERVER = "wss://"+custom_input_server+"/cmsocket/";
        WS = new WebSocket(WSS_SERVER)
        WS.onopen = () => {
            console.log('WS opened')
            Steam_SendHello();
            Steam_SendLogon(username, password);
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
            disconnect("Websocket Error");
        }
        WS.onclose = (event) =>{
            disconnect("WS closed");
        }
    }
//#endregion -----------------------------------------------------------------------------------------------------------------




// USER INTERFACE RELATED SECTIONS //


// ---------------------------------------------------------------------------------------------------------------------------
// #region PAGE LOGIN
    const username_field = document.getElementById("username");
    const password_field = document.getElementById("password");
    const submit_field = document.getElementById("login_submit_button");
    function try_cached_credentials(){
        if (typeof STATIC_USERNAME !== 'undefined' && STATIC_USERNAME != null)
            username_field.value = STATIC_USERNAME;
        if (typeof STATIC_PASSWORD !== 'undefined' && STATIC_PASSWORD != null)
            password_field.value = STATIC_PASSWORD;
        login_field_changed();
    }
    function login_submit(){
        if (ACTIVE_PAGE != LOGIN_PAGE){
            console.log("tried to log in when not on login page??");
            return;
        }

        let username = username_field.value;
        let password = password_field.value;
        if (!username){ print("no username provided!"); return; }
        if (!password){ print("no password provided!"); return; }

        switch_page(LOADING_PAGE);
        init_steam_connection(username, password);
    }
    function login_field_changed(){
        if (username_field.value && password_field.value)
            submit_field.removeAttribute("disabled");
        else
            submit_field.setAttribute("disabled", "disabled");
    }
    try_cached_credentials();
    
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region PAGE NAVIGATION
    var ACTIVE_PAGE = 0;
    const LOGIN_PAGE = 0;
    const LOADING_PAGE = 1;
    const BROWSE_PAGE = 2;
    const DETAILS_PAGE = 3;
    const _LOGIN_PAGE = document.getElementById("login_view")
    const _LOADING_PAGE = document.getElementById("loading_view")
    const _BROWSE_PAGE = document.getElementById("browser_view")
    const _DETAILS_PAGE = document.getElementById("details_view")
    function switch_page(page_index){
        console.log("switching to page: " + page_index)
        ACTIVE_PAGE = page_index;
        _LOGIN_PAGE.style.display   = "none";
        _LOADING_PAGE.style.display = "none";
        _BROWSE_PAGE.style.display  = "none";
        _DETAILS_PAGE.style.display = "none";
        if (page_index == LOGIN_PAGE  ) _LOGIN_PAGE.style.display    = "block";
        if (page_index == LOADING_PAGE) _LOADING_PAGE.style.display  = "block";
        if (page_index == BROWSE_PAGE ) _BROWSE_PAGE.style.display   = "block";
        if (page_index == DETAILS_PAGE) _DETAILS_PAGE.style.display  = "block";
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region ERROR DISPLAY
    const error_panel = document.getElementById("error_view");
    function print(error_msg, was_sucess = false){
        var error_div = document.createElement('div');
        if (was_sucess) error_div.className = 'error_item_success';
        else            error_div.className = 'error_item';
        error_div.innerText = error_msg
        error_panel.appendChild(error_div);

        setTimeout(remove_error, 5000, error_div);
    }
    function remove_error(error_div){
        error_panel.removeChild(error_div)
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region POPULATE MOD GALLERY
    const browser_gallery = document.getElementById("browser_gallery_view");
    const results_display = document.getElementById("results_display");
    var loaded_gallery_tiles = {};
    function ingest_mod_list(mods, jobid){
        if (jobid != active_query_id) {print("recieved mod query response with wrong jobid!!"); return;}

        active_query_id = null;
        // remove placeholder query object
        if (active_query_placeholder != null) {
            browser_gallery.removeChild(active_query_placeholder);
            active_query_placeholder = null;
        }

        total_num_of_results = mods.total;
        results_display.innerText = "" + (curr_page_index*MODS_PER_PAGE) + "/" + short_string_number(mods.total) + " results";
        let arr = mods.publishedfiledetails;
        for (let i = 0; i < arr.length; i++){
            let curr_mod = arr[i]
            create_mod_tile(curr_mod);

        }
    }
    function create_mod_tile(mod_instance){
        // title, previewUrl


        let mod_tile = document.createElement('div');
        mod_tile.className = 'browser_item_tile';

        // store a reference of the mod so we can find it later
        let mod_id_uint32 = mod_instance.publishedfileid.toString(); // (mod_instance.publishedfileid.low >>> 0) ^ (mod_instance.publishedfileid.high >>> 0);
        loaded_gallery_tiles[mod_id_uint32] = mod_instance;
        // let the mod tile be clicked???
        mod_tile.setAttribute('mod-id', mod_id_uint32);
        mod_tile.onclick = function(event) {
            console.log(this);
            let test = this.getAttribute('mod-id');
            console.log("doody_mode " + test);
            select_tile(Number(test));
        }

            let mod_preview = document.createElement('img');
            mod_preview.src = mod_instance.previewUrl;
            mod_preview.className = 'browser_item_preview';
            mod_tile.appendChild(mod_preview);

            let mod_title = document.createElement('span');
            mod_title.innerText = mod_instance.title;
            mod_title.className = 'browser_item_title';
            mod_tile.appendChild(mod_title);

            let mod_stats = document.createElement('div');
            mod_stats.className = 'browser_item_stats_bar';

                // downloads
                let mod_dl_icon = document.createElement('img');
                mod_dl_icon.src = "RES/icon_dl.png";
                mod_dl_icon.className = 'browser_item_icon';
                mod_stats.appendChild(mod_dl_icon);

                let mod_dl_stat = document.createElement('span');
                mod_dl_stat.innerText = short_string_number(mod_instance.lifetimeSubscriptions);
                mod_dl_stat.className = 'browser_item_stat';
                mod_stats.appendChild(mod_dl_stat);

                // favorites
                let mod_fav_icon = document.createElement('img');
                mod_fav_icon.src = "RES/icon_fav.png";
                mod_fav_icon.className = 'browser_item_icon';
                mod_stats.appendChild(mod_fav_icon);

                let mod_fav_stat = document.createElement('span');
                mod_fav_stat.innerText = short_string_number(mod_instance.favorited);
                mod_fav_stat.className = 'browser_item_stat';
                mod_stats.appendChild(mod_fav_stat);

                // size // not good??
                // let mod_size_icon = document.createElement('img');
                // mod_size_icon.src = "RES/icon_size.png";
                // mod_size_icon.className = 'browser_item_icon';
                // mod_stats.appendChild(mod_size_icon);

                // let mod_size_stat = document.createElement('span');
                // mod_size_stat.innerText = short_string_number_bytes(mod_instance.fileSize);
                // mod_size_stat.className = 'browser_item_stat';
                // mod_stats.appendChild(mod_size_stat);



            mod_tile.appendChild(mod_stats);

        browser_gallery.appendChild(mod_tile);

    }
    function create_placeholder_tile(){
        let mod_tile = document.createElement('div');
        mod_tile.className = 'browser_item_placeholder';

            let mod_preview = document.createElement('img');
            mod_preview.src = "RES/logo_cutout_animated.png";
            mod_preview.className = 'browser_item_placeholder_img';
            mod_tile.appendChild(mod_preview);

        browser_gallery.appendChild(mod_tile);
        return mod_tile;
    }
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region SCOLL AUTO SEARCH LOADER?? 
    const browser_scroller = document.getElementById("browser_scroller");
    function check_scroll(){
        // DO NOT SCROLL IF NOT ON BROWSE PAGE???
        if (ACTIVE_PAGE != BROWSE_PAGE) return;

        // make sure we have called a search
        if (curr_page_index == null) return;;

        // make sure we aren't awaiting a query result
        if (active_query_id != null) return;

        // make sure we have a total number of mods loaded (implying we've already recieved the first batch of results??)
        if (total_num_of_results == null) return;

        // make sure theres another page past the current one??
        if (total_num_of_results <= curr_page_index * MODS_PER_PAGE) return;


        let pixels_from_bottom = browser_scroller.scrollHeight - (browser_scroller.offsetHeight + browser_scroller.scrollTop);

        if (Number.isInteger(pixels_from_bottom) && pixels_from_bottom <= 100){
            print("queuing next search!!", true);
            curr_page_index += 1;
            
            active_query_id = Steam_SendWorkshopQuery(curr_game_id, curr_sort_type, curr_page_index, curr_filter_string);
            active_query_placeholder = create_placeholder_tile();
        }
    }
    setInterval(check_scroll, 500);
//#endregion -----------------------------------------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------------------------------------------------
// #region SEARCH FILTERS + auto loading next pages via scrolling
    const gameid_field = document.getElementById("gameid_field");
    const sort_field = document.getElementById("sort_select");
    const search_field = document.getElementById("search_field");
    const date_filter_display = document.getElementById("date_filter_display");
    // current search values
        var curr_sort_type = 0;
        var curr_filter_string = null;
        var curr_page_index = null;
        var curr_game_id = null;

        var active_query_id = null;
        var active_query_placeholder = null;

        var total_num_of_results = null;
    //

    const MODS_PER_PAGE = 50;


    function search_run(){
        if (ACTIVE_PAGE != BROWSE_PAGE){ print("cant make searches while not browsing!! what the hell??"); return; }
        // make sure we finish our current search first??
        if (active_query_id != null && curr_page_index === 1){ 
            print("wait for the first search to finish first???"); return; 
        }

        // get target game
        try{curr_game_id = Number(gameid_field.value);
        } catch (ex){ print("Bad game ID !!!"); return; }

        // get sorting type
        curr_sort_type = 0;
        if      (sort_field.value == "most_popular"   ){ curr_sort_type = 0;  } // k_EUGCQuery_RankedByVote                 	0	Sort by vote popularity all-time
        else if (sort_field.value == "most_subscribed"){ curr_sort_type = 12; } // k_EUGCQuery_RankedByTotalUniqueSubscriptions	12	Sort by lifetime total unique # of subscribers descending
        else if (sort_field.value == "most_recent"    ){ curr_sort_type = 1;  } // k_EUGCQuery_RankedByPublicationDate      	1	Sort by publication date descending
        else if (sort_field.value == "last_updated"   ){ curr_sort_type = 19; } // k_EUGCQuery_RankedByLastUpdatedDate      	19	Sort by last updated time.
        else if (sort_field.value == "relevance"      ){ curr_sort_type = 11; } // k_EUGCQuery_RankedByTextSearch           	11	Sort by keyword text search relevancy
        else { print("invalid sort by selection!!!"); return; }
        console.log(sort_field.value);

        // reset results count
        total_num_of_results = null;

        // get search string    
        curr_filter_string = null;
        if (search_field.value)
            curr_filter_string = search_field.value;

        // get page index
        curr_page_index = 1;

        // clear UI before callijng
        browser_gallery.replaceChildren();
        loaded_gallery_tiles = {}; // clear thingos

        // print out the date being filtered
        //if (filter_start_date != null){
            if (filter_date_type == NO_DATE){
                date_filter_display.innerText = "[All time]";
            } else if (filter_date_type == YEAR){
                date_filter_display.innerText = "[Year] " + formatDate(filter_start_date);
            } else if (filter_date_type == MONTH){
                date_filter_display.innerText = "[Month] " + formatDate(filter_start_date);
            } else if (filter_date_type == WEEK){
                date_filter_display.innerText = "[Week] " + formatDate(filter_start_date);
            } else if (filter_date_type == DAY){
                date_filter_display.innerText = "[Day] " + formatDate(filter_start_date);
            } 
        //}

        // store query to list so we can match up the data later
        active_query_id = Steam_SendWorkshopQuery(curr_game_id, curr_sort_type, curr_page_index, curr_filter_string);
        active_query_placeholder = create_placeholder_tile();
    }
    
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region DATE FILTERING
    const NO_DATE = 0;
    const YEAR = 1;
    const MONTH = 2; 
    const WEEK = 3;
    const DAY = 4;
    var filter_date_type = NO_DATE;
    var filter_start_date = null;

    const year_button = document.getElementById("year_button");
    const month_button = document.getElementById("month_button");
    const week_button = document.getElementById("week_button");
    const day_button = document.getElementById("day_button");
    function date_filter_prelude(SORT_TYPE, dir){
        clear_selected_date_filter();
        if (dir == 0 && filter_date_type == SORT_TYPE){ disable_date_filter(); return false; }
        if (filter_start_date == null) filter_start_date = new Date();
        filter_start_date.setHours(0, 0, 0, 0);
        filter_date_type = SORT_TYPE;
        return true;
    }
    function sort_year(dir){
        if (!date_filter_prelude(YEAR, dir)) return;
        year_button.classList.add('browser_date_sort_toggled');
        // round to nearest year
        filter_start_date = getYearday(filter_start_date);
        // alter date as specified
        if (dir!=0) filter_start_date.setFullYear( filter_start_date.getFullYear() + dir );
        search_run();
    }
    function sort_mnth(dir){
        if (!date_filter_prelude(MONTH, dir)) return;
        month_button.classList.add('browser_date_sort_toggled');
        // round to nearest month
        filter_start_date = getMonthday(filter_start_date);
        // alter date as specified
        if (dir!=0) filter_start_date.setMonth( filter_start_date.getMonth() + dir );
        search_run();
    }
    function sort_week(dir){
        if (!date_filter_prelude(WEEK, dir)) return;
        week_button.classList.add('browser_date_sort_toggled');
        // round to hearest week
        filter_start_date = getMonday(filter_start_date);
        // alter date as specified
        if (dir!=0) filter_start_date.setDate( filter_start_date.getDate() + (dir*7) );
        search_run();

    }
    function sort_dayy(dir){
        if (!date_filter_prelude(DAY, dir)) return;
        day_button.classList.add('browser_date_sort_toggled');
        // no date rounding needed
        // alter date as specified
        console.log(filter_start_date);
        if (dir!=0) filter_start_date.setDate( filter_start_date.getDate() + dir );
        search_run();
    }
    function clear_selected_date_filter(){
        year_button.classList.remove('browser_date_sort_toggled');
        month_button.classList.remove('browser_date_sort_toggled');
        week_button.classList.remove('browser_date_sort_toggled');
        day_button.classList.remove('browser_date_sort_toggled');
    }
    function disable_date_filter(){
        filter_date_type = NO_DATE;
        filter_start_date = null;
        search_run();
    }

//#endregion -----------------------------------------------------------------------------------------------------------------



// ---------------------------------------------------------------------------------------------------------------------------
// #region LOADING DETAILS PAGE
    function select_tile(mod_id){
        load_details(loaded_gallery_tiles[mod_id]);
    }
    const details_active_image = document.getElementById("details_active_image")
    const details_gallery = document.getElementById("details_gallery")
    const details_description = document.getElementById("details_description")
    const details_side_panel = document.getElementById("details_side_panel")
    function create_mini(url){
        let preview_img = document.createElement('img');
        preview_img.src = url;
        preview_img.className = 'details_mini_image';
        preview_img.onclick = function(event){
            details_active_image.src = this.src;
        }
        details_gallery.appendChild(preview_img);
    }
    function load_details(mod){
        if (ACTIVE_PAGE != BROWSE_PAGE){ console.log("cant access details page unless on browse page??");return; }
        switch_page(DETAILS_PAGE);
        details_gallery.replaceChildren();

        // activate image
        details_active_image.src = mod.previewUrl

        // load all extra images
        create_mini(mod.previewUrl);
        if (typeof mod.previews !== 'undefined'){
            for (let i = 0; i < mod.previews.length; i++){
                let curr_preview = mod.previews[i];
                if (curr_preview.previewType == 0){ // image
                    create_mini(curr_preview.url)
                } else if (curr_preview.previewType == 1){ // youtube video
                    create_mini("RES/icon_dl.png")
                }
            }
        }

        // load description
        
        details_description.innerText = mod.fileDescription;

        // load all extra junk data
        let detail_text = mod.title + "\r\n";

        detail_text += "favorites: " + mod.favorited + "\r\n";
        detail_text += "lifetime favorites: " + mod.lifetimeFavorited + "\r\n";
        detail_text += "subscriptions: " + mod.subscriptions + "\r\n";
        detail_text += "lifetime subscriptions: " + mod.lifetimeSubscriptions + "\r\n";
        detail_text += "views: " + mod.views + "\r\n";
        detail_text += "\r\n";
        detail_text += "file size: " + mod.fileSize + "\r\n";
        detail_text += "comments: " + mod.numCommentsPublic + "\r\n";
        detail_text += "\r\n";
        detail_text += "revision: " + mod.revisionChangeNumber.toString() + "\r\n";
        detail_text += "time created: " + fromUnixTimestamp(mod.timeCreated).toDateString() + "\r\n";
        detail_text += "time updated: " + fromUnixTimestamp(mod.timeUpdated).toDateString() + "\r\n";
        detail_text += "\r\n";
        detail_text += "upvotes: " + mod.voteData.votesUp + "\r\n";
        detail_text += "downvotes: " + mod.voteData.votesDown + "\r\n";
        detail_text += "\r\n";
        detail_text += "tags:\r\n";
        if (typeof mod.tags !== 'undefined'){
            for (let i = 0; i < mod.tags.length; i++){
                let curr_tag = mod.tags[i];
                detail_text += "- " + curr_tag.displayName + "(" + curr_tag.tag + ")" + "\r\n";
            }
        }

        details_side_panel.innerText = detail_text;
    }
    function close_details(){
        if (ACTIVE_PAGE != DETAILS_PAGE){ console.log("cant back out of details if not on details??");return; }
        switch_page(BROWSE_PAGE);
    }
//#endregion -----------------------------------------------------------------------------------------------------------------




// ---------------------------------------------------------------------------------------------------------------------------
// #region FUNCTION EXPORTS
window.login_submit=login_submit;
window.login_field_changed=login_field_changed;
window.search_run=search_run;
window.close_details=close_details;

window.sort_year=sort_year;
window.sort_week=sort_week;
window.sort_mnth=sort_mnth;
window.sort_dayy=sort_dayy;
//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region placeholder

//#endregion -----------------------------------------------------------------------------------------------------------------










// WIP/REFERENCE CODE SECTION //


// ---------------------------------------------------------------------------------------------------------------------------
// #region STEAM API SERVER GETTER API
    //  ## REQUEST SERVERS ##
        //const url = "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?format=vdf&cellid=0";
        // const url = "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/";//?format=vdf&cellid=0";
        // async function THING() {
            
        //     const response = await fetch(url);
        //     const jsonData = await response.json();
        // }
    //
//THING();


//#endregion -----------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// #region WEB SOCKET FETCHING REFERENCE CODE

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
//#endregion -----------------------------------------------------------------------------------------------------------------

