if (typeof initializeMic === 'undefined') {
    var audioContext;
    var input;
    var current_audio_recorder;
    var current_vm_blob;
    var current_getusermedia_stream;
    const encodingType = 'mp3';
    const encodeAfterRecord = true;

// Function to initialize the microphone and start recording
    function initializeMic() {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(function (stream) {
            current_getusermedia_stream = stream;  // Store the stream to stop it later
            input = audioContext.createMediaStreamSource(stream);
            current_audio_recorder = new WebAudioRecorder(input, {
                workerDir: "/static/js/",
                encoding: encodingType,
                numChannels: 2,
                onEncoderLoading: function (recorder, encoding) {
                    console.log("Loading " + encoding + " encoder...");
                },
                onEncoderLoaded: function (recorder, encoding) {
                    console.log(encoding + " encoder loaded");
                }
            });
            current_audio_recorder.onComplete = function (recorder, blob) {
                console.log("Encoding complete");
                releaseMic();
                current_vm_blob = blob;
                var audioFile = new File([blob], 'voice_memo.mp3', {type: 'audio/mp3'});
                uploadFile(audioFile);
            };
            current_audio_recorder.setOptions({
                timeLimit: 600,
                encodeAfterRecord: encodeAfterRecord,
                ogg: {quality: 0.5},
                mp3: {bitRate: 256}
            });
            current_audio_recorder.startRecording();
        }).catch(function (err) {
            console.log(err);
        });
    }

// Function to release the microphone
    function releaseMic() {
        if (current_getusermedia_stream) {
            current_getusermedia_stream.getAudioTracks().forEach(function (track) {
                track.stop();
            });
            current_getusermedia_stream = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
    }

// Function to upload the file using jQuery AJAX
    function uploadFile(file) {
        var formData = new FormData();
        formData.append("file", file);
        $.ajax({
            url: "/json/user_uploads",
            type: "POST",
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                var url = response.uri;
                var filename = url.split("/").pop();
                var syntax_to_insert = "[" + filename + "](" + url + ")";
                console.log("Uploaded: " + syntax_to_insert);
                if ($('.message_edit_content').length > 0) {
                    $('.message_edit_content').val((index, value) => `${value}${syntax_to_insert}`);
                } else {
                    $('#compose-textarea').val((index, value) => `${value}${syntax_to_insert}`);
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.log("Upload failed: " + textStatus);
            }
        });
    }
}


// Document ready function to initialize everything
jQuery(function () {
    const $csrf_input = $('input[name="csrfmiddlewaretoken"]');
    const csrf_token = $csrf_input.attr("value");
    // Set CSRF token in AJAX requests
    $.ajaxSetup({
        beforeSend: function (xhr, settings) {
            // Only send the token to relative URLs i.e. locally.
            xhr.setRequestHeader("X-CSRFToken", csrf_token);
        }
    });
    $(".start-recording-button").off('click').on("click", function () {
        initializeMic();
        $(this).addClass("flashing");
        $(".stop-recording-button").show();
        $(".start-recording-button").hide();
    });
    $(".stop-recording-button").off('click').on("click", function () {
        current_audio_recorder.finishRecording();
        $(".stop-recording-button").hide();
        $(".start-recording-button").removeClass("flashing").show();
    });
});
