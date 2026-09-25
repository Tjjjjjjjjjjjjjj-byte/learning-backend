import { spawn } from 'child_process';

//
function downloadFromSpecificYouTuber(trackQuery, targetYouTuber) {
    console.log(`Searching for "${trackQuery}"...`);

    const search = spawn('yt-dlp', [
        '--skip-download',
        '--flat-playlist',
        '--print', '{"title": "%(title)s", "uploader": "%(uploader)s", "url": "%(url)s"}',
        `ytsearch5:${trackQuery}`
    ]);

    let outputData = '';

    search.stdout.on('data', (data) => {
        outputData += data.toString();
    });

    search.on('close', (code) => {
        if (code !== 0) return console.error('Search failed.');
        const results = outputData.trim().split('\n').map(line => JSON.parse(line));
        const matchedVideo = results.find(video => 
            video.uploader.toLowerCase().includes(targetYouTuber.toLowerCase())
        );

        if (!matchedVideo) {
            return;
        }

        const download = spawn('yt-dlp', [
            '-x', 
            '--audio-format', 'mp3', 
            '--audio-quality', '0',
            '--output', '%(title)s.%(ext)s',
            matchedVideo.url
        ]);

        download.stdout.on('data', (data) => console.log(data.toString().trim()));
        download.on('close', (exitCode) => {
            if (exitCode === 0) return;
        });
    });
}

// Example usage:
// Searches "Sining Dionela", looks for the result uploaded by "Dionela"
downloadFromSpecificYouTuber('sining', 'Dionela');
