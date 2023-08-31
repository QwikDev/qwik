import {
  component$,
  useSignal,
  useStylesScoped$,
  useVisibleTask$,
} from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

export default component$(() => {
  const audioElementSignal = useSignal<HTMLAudioElement | undefined>();
  const audioPlayButtonSignal = useSignal<HTMLButtonElement | undefined>();
  const audioIsPlayingSignal = useSignal(false);
  const videoElementSignal = useSignal<HTMLAudioElement | undefined>();
  const videoPlayButtonSignal = useSignal<HTMLButtonElement | undefined>();
  const videoIsPlayingSignal = useSignal(false);

  const location = useLocation();

  const audioSrc = location.url.origin + '/sample-media/qwik_audio.mp3';
  const videoSrc = location.url.origin + '/sample-media/qwik_koi_video.mp4';
  console.log('audioSrc', audioSrc);
  console.log('videoSrc', videoSrc);

  useStylesScoped$(`
    segment {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        color: #1dacf2
    }    
    button {
        padding: 20px;
        font-weight: bold;
        font-size: 1.2em;
        width: 50%;
        background: #1dacf2;
        color: white;
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
    if (!videoElementSignal.value) return;

    const play = () =>
      videoIsPlayingSignal.value
        ? videoElementSignal.value?.pause()
        : videoElementSignal.value?.play();

    videoPlayButtonSignal.value?.removeEventListener('click', play);
    videoPlayButtonSignal.value?.addEventListener('click', play);

    return () =>
      videoPlayButtonSignal.value?.removeEventListener('click', play);
  });

  return (
    <segment>
      <h2>iOS Media Player</h2>
      <br />
      <video
        ref={videoElementSignal}
        src={videoSrc}
        style={{ border: '1px solid gray', width: '50%', height: '50%' }}
        onPlay$={() => (videoIsPlayingSignal.value = true)}
        onPause$={() => (videoIsPlayingSignal.value = false)}
        onEnded$={() => (videoIsPlayingSignal.value = false)}
      />
      <audio
        ref={audioElementSignal}
        src={audioSrc}
        onPlay$={() => (audioIsPlayingSignal.value = true)}
        onPause$={() => (audioIsPlayingSignal.value = false)}
        onEnded$={() => (audioIsPlayingSignal.value = false)}
      />
      <br />
      <button ref={videoPlayButtonSignal}>
        {videoIsPlayingSignal.value ? 'Pause' : 'Play'} Video
      </button>
      <br />
      <button ref={audioPlayButtonSignal}>
        {audioIsPlayingSignal.value ? 'Pause' : 'Play'} Audio
      </button>
      <br />
      <br />
    </segment>
  );
});
