const parseYT = (url) => {
    var p = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    var matches = url.match(p);
    if (matches) {
        return matches[1];
    }
    return false;
};

const showPatchNotes = () => {
    $('.ui.modal').modal('show');
};

$(document).ready(function () {
    $('#loader').fadeOut(function () {
        $('nav, #content').fadeIn();
        $('#loader').remove();
    });
    $('.ui.accordion').accordion();
    window.electron.ready();
});

$('#youtubeUrl').keyup(function () {
    //verify url
    const id = parseYT($('#youtubeUrl').val().trim());
    if (!id) {
        $('#youtubeUrl').removeClass('success-box').addClass('error-box');
    } else {
        $('#youtubeUrl').removeClass('error-box').addClass('success-box');
    }
});

const err = (text) => {
    return $('body').toast({
        title     : 'Error',
        message   : text,
        class     : 'error',
        className : {
            toast : 'ui message'
        }
    });
};

$('#youtubeUrl').keydown(function (e) {
    if (e.keyCode === 13) {
        const id = parseYT($('#youtubeUrl').val().trim());
        if (!id) return err('Invalid YouTube URL');
        Download(id);
    }
});
$('#youtubeDL').click(function () {
    const id = parseYT($('#youtubeUrl').val().trim());
    if (!id) return err('Invalid YouTube URL');
    Download(id);
});

let DL = false;

const Download = (id) => {
    if ($('#' + id).length) return err('Already added to queue');
    if (DL) return;
    DL = true;
    $('#youtubeUrl, #youtubeDL, #format').prop('disabled', true);
    console.log('Downloading');
    window.electron.addToQueue({ id: id, format: $('#format').val(), quality: $('#quality').val() });
};

document.onkeydown = function (t) {
    if (t.which == 9) {
        return false;
    }
};

const addToQueue = (id, title, thumbnail, format, output) => {
    DL = false;
    $('#youtubeUrl, #youtubeDL, #format').prop('disabled', false);
    $('.queue').prepend(`<div style="display:none;" id="${id}" class="ui horizontal fluid card">
        <div class="image"><img src="${thumbnail}"></div>
        <div class="content">
            <div class="header">${title}</div>
            <div class="meta"><span class="category">${output}</span></div>
            <div class="description">Waiting...</div>
        </div>
        <div class="ui bottom indicating attached progress" data-percent="0">
            <div class="bar"></div>
        </div>
    </div>`);
    $('#' + id).fadeIn(750);
};

window.electron.receive('addQueue', (event, data) => {
    addToQueue(data.id, data.title, data.data.thumbnail.url, data.format, data.musicDir);
});
window.electron.receive('edit', (event, data) => {
    const { progress, id, text, eta } = data;
    $('#' + id + ' .progress').progress({ percent: progress });
    $('#' + id + ' .description').text(text);
});
window.electron.receive('finish', (event, data) => {
    const { id, text, title } = data;
    $('#' + id + ' .description').text(text);
    $('#' + id).attr('id', id + '-finish');
});
window.electron.receive('fail', (event, data) => {
    const { id, text, title } = data;
    $('#' + id + ' .progress').progress({ percent: 100 });
    $('#' + id + ' .progress').addClass('error');
    $('#' + id + ' .description').text(text);
    $('#' + id).attr('id', id + '-error');
});
window.electron.receive('error', (event, data) => {
    err(data.error);
});

window.electron.receive('ready', (event, arg) => {
    $('#currentFolder').text(arg.store);
});

$('nav li').click(function () {
    $('.nav-link').removeClass('active');
    $(this).children('.nav-link').addClass('active');
    const id = $(this).attr('data-id');
    $('.page').hide();
    $('#' + id).show();
});

$('#changeFolder').click(function () {
    window.electron.changeFolder();
});

$('#changelogBtn').click(showPatchNotes);

/**
 * AUTO UPDATER
 */
window.electron.receive('patchNotes', () => {
    $('#changelog .header').html("What's new");
    showPatchNotes();
});
window.electron.receive('update-available', () => {
    $('.update').fadeIn();
});
window.electron.receive('update-downloaded', () => {
    $('.update p').html(
        '<div style="text-align:center;">An update is available<br><button id="restart" class="ui button positive">Apply update</button></div>'
    );
    $('.update .progress').removeClass('swinging indeterminate').progress({ percent: 100 });

    $('#restart').click(function () {
        window.electron.restart();
    });
});

window.electron.receive('ping', (arg, data) => {
    if (Date.now() - data < 5000) {
        $('#queuePing').text('running').removeClass('red').addClass('green');
    } else {
        $('#queuePing').text('stopped').addClass('red').removeClass('green');
    }
});
window.electron.ping();

setInterval(() => {
    window.electron.ping();
}, 5000);
