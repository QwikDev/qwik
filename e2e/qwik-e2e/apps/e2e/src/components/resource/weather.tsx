/* eslint-disable */
import { component$, type ComputedSignal, useComputed$, useStore, useTask$ } from '@qwik.dev/core';
import { delay } from '../delay';

export interface WeatherData {
  name: string;
  wind: { speed: number; deg: number };
  visibility: number;
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  pressure: number;
  humidity: number;
}

export const Weather = component$(() => {
  const state = useStore({
    city: '',
    debouncedCity: '',
    weather: undefined,
  });

  // Debounce city
  useTask$(() => {
    const city = state.city;
    const timer = setTimeout(() => {
      state.debouncedCity = city;
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  });

  const weather = useComputed$<WeatherData | undefined>(async ({ abortSignal }) => {
    const city = state.debouncedCity;
    abortSignal.addEventListener('abort', () => console.log('abort request for ', city), {
      once: true,
    });
    if (city.length < 2) {
      return undefined;
    }
    const value = await fetchWeather(city, abortSignal);
    return value;
  });

  return (
    <div>
      <input
        type="text"
        value={state.city}
        name="city"
        autoComplete="off"
        placeholder="City name"
        onInput$={(ev, el) => (state.city = el.value)}
      />
      <WeatherResults2 weather={weather} />
    </div>
  );
});

export const WeatherResults = component$((props: { weather: ComputedSignal<WeatherData> }) => {
  console.log('rerender');
  return (
    <div>
      {props.weather.pending ? (
        <div>loading data...</div>
      ) : props.weather.error ? (
        <div>error</div>
      ) : (
        <ul>
          <li>name: {props.weather.value.name}</li>
          <li>temp: {props.weather.value.temp}</li>
          <li>feels_like: {props.weather.value.feels_like}</li>
          <li>humidity: {props.weather.value.humidity}</li>
          <li>temp_max: {props.weather.value.temp_max}</li>
          <li>temp_min: {props.weather.value.temp_min}</li>
          <li>visibility: {props.weather.value.visibility}</li>
        </ul>
      )}
    </div>
  );
});

export const WeatherResults2 = component$(
  (props: { weather: ComputedSignal<WeatherData | undefined> }) => {
    console.log('rerender');
    return (
      <div>
        {props.weather.pending ? (
          <div>loading data...</div>
        ) : props.weather.error ? (
          <div>error {String(props.weather.error)}</div>
        ) : props.weather.value ? (
          <ul>
            <li>name: {props.weather.value.name}</li>
            <li>temp: {props.weather.value.temp}</li>
            <li>feels_like: {props.weather.value.feels_like}</li>
            <li>humidity: {props.weather.value.humidity}</li>
            <li>temp_max: {props.weather.value.temp_max}</li>
            <li>temp_min: {props.weather.value.temp_min}</li>
            <li>visibility: {props.weather.value.visibility}</li>
          </ul>
        ) : (
          <div>Please write some city</div>
        )}
      </div>
    );
  }
);

export async function fetchWeather(city: string, signal: AbortSignal): Promise<WeatherData> {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('q', city);
  url.searchParams.set('appid', '796dc66c4335ab39e43f882c0098b076');

  await delay(500);
  const res = await fetch(url, { signal });
  const json = await res.json();
  if (json.cod !== 200) {
    throw new Error('City not found');
  }
  return {
    name: json.name,
    wind: json.wind,
    visibility: json.visibility,
    feels_like: json.main.feels_like,
    humidity: json.main.humidity,
    pressure: json.main.pressure,
    temp: json.main.temp,
    temp_max: json.main.temp_max,
    temp_min: json.main.temp_min,
  };
}
