import {
  component$,
  useSignal,
  useStylesScoped$,
  useVisibleTask$,
} from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

const AUDIO_SRC =
  'https://cdn.builder.io/o/assets%2F5b8073f890b043be81574f96cfd1250b%2Fafe011812da146a5b2263196cb25f263?alt=media&token=c017cd87-0598-4af2-8afd-e9b5a3fba078&apiKey=5b8073f890b043be81574f96cfd1250b';
const VIDEO_SRC =
  'https://cdn.builder.io/o/assets%2F5b8073f890b043be81574f96cfd1250b%2F06f32f252e7d46a48954e5939b7292e1%2Fcompressed?apiKey=5b8073f890b043be81574f96cfd1250b&token=06f32f252e7d46a48954e5939b7292e1&alt=media&optimized=true';

export default component$(() => {
  const audioElementSignal = useSignal<HTMLAudioElement | undefined>();
  const audioPlayButtonSignal = useSignal<HTMLButtonElement | undefined>();
  const audioIsPlayingSignal = useSignal(false);
  const videoElementSignal = useSignal<HTMLAudioElement | undefined>();
  const videoPlayButtonSignal = useSignal<HTMLButtonElement | undefined>();
  const videoIsPlayingSignal = useSignal(false);
  const location = useLocation();

  const videoPoster =
    location.url.origin + '/sample-media/qwik-koi-poster.jpg';
  console.log('videoPoster', videoPoster);
  useStylesScoped$(`
        segment {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          width: 100%;
          padding: 20px;
          color: #1dacf2
        }
        .content {
          width: 50%;
        }   
        button {
          padding: 20px;
          font-weight: bold;
          font-size: 1.2em;
          width: 100%;
          background: #1dacf2;
          color: white;
        }
        .video-container {
          position: relative;
          width: 100%;
          height: 0;
          padding-bottom: calc(56.25% + 1px);
        }
        video {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          border: 1px solid gray;
        }
        `);

  useVisibleTask$(({ track }) => {
    track(() => audioPlayButtonSignal.value);
    track(() => audioElementSignal.value);
    if (!audioElementSignal.value) return;

    const play = () =>
      audioIsPlayingSignal.value
        ? audioElementSignal.value?.pause()
        : audioElementSignal.value?.play();

    audioPlayButtonSignal.value?.removeEventListener('click', play);
    audioPlayButtonSignal.value?.addEventListener('click', play);

    return () =>
      audioPlayButtonSignal.value?.removeEventListener('click', play);
  });

  useVisibleTask$(({ track }) => {
    track(() => videoPlayButtonSignal.value);
    track(() => videoElementSignal.value);
    if (!videoElementSignal.value || !videoPlayButtonSignal.value) return;

    const play = () =>
      videoIsPlayingSignal.value
        ? videoElementSignal.value!.pause()
        : videoElementSignal.value?.play();

    videoPlayButtonSignal.value?.addEventListener('click', play);
    return () =>
      videoPlayButtonSignal.value?.removeEventListener('click', play);
  });

  return (
    <segment>
      <div class="content">
        <h1>Media Controller</h1>
        <h3>
          <i>with iOS Support</i>
        </h3>
        <br />
        <div class="video-container">
          <video
            ref={videoElementSignal}
            src={VIDEO_SRC}
            poster={videoPoster}
            playsInline
            onPlay$={() => (videoIsPlayingSignal.value = true)}
            onPause$={() => (videoIsPlayingSignal.value = false)}
            onEnded$={() => (videoIsPlayingSignal.value = false)}
          />
        </div>

        <audio
          ref={audioElementSignal}
          src={AUDIO_SRC}
          onPlay$={() => (audioIsPlayingSignal.value = true)}
          onPause$={() => (audioIsPlayingSignal.value = false)}
          onEnded$={() => (audioIsPlayingSignal.value = false)}
        />
        <br />
        <button ref={videoPlayButtonSignal}>
          {videoIsPlayingSignal.value ? 'Pause' : 'Play'} Video
        </button>
        <br />
        <br />
        <button ref={audioPlayButtonSignal}>
          {audioIsPlayingSignal.value ? 'Pause' : 'Play'} Audio
        </button>
      </div>
    </segment>
  );
});
