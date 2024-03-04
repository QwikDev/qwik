/* eslint-disable */
import {
  component$,
  useStore,
  useResource$,
  Resource,
  useTask$,
  type ResourceReturn,
} from "@builder.io/qwik";

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
    city: "",
    debouncedCity: "",
    weather: undefined,
  });

  // Debounce city
  useTask$(({ track }) => {
    const city = track(() => state.city);
    const timer = setTimeout(() => {
      state.debouncedCity = city;
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  });

  const weather = useResource$<WeatherData | undefined>(
    async ({ track, cleanup }) => {
      const city = track(() => state.debouncedCity);
      cleanup(() => console.log("abort request for ", city));
      if (city.length < 2) {
        return undefined;
      }
      const controller = new AbortController();
      cleanup(() => controller.abort());
      const value = await fetchWeather(city, controller.signal);
      return value;
    },
  );

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

export const WeatherResults = component$(
  (props: { weather: ResourceReturn<WeatherData> }) => {
    console.log("rerender");
    return (
      <div>
        <Resource
          value={props.weather}
          onPending={() => <div>loading data...</div>}
          onRejected={() => <div>error</div>}
          onResolved={(resolved) => (
            <ul>
              <li>name: {resolved.name}</li>
              <li>temp: {resolved.temp}</li>
              <li>feels_like: {resolved.feels_like}</li>
              <li>humidity: {resolved.humidity}</li>
              <li>temp_max: {resolved.temp_max}</li>
              <li>temp_min: {resolved.temp_min}</li>
              <li>visibility: {resolved.visibility}</li>
            </ul>
          )}
        />
      </div>
    );
  },
);

export const WeatherResults2 = component$(
  (props: { weather: ResourceReturn<WeatherData | undefined> }) => {
    console.log("rerender");
    return (
      <div>
        <Resource
          value={props.weather}
          onPending={() => <div>loading data...</div>}
          onRejected={(reason) => <div>error {`${reason}`}</div>}
          onResolved={(weather) => {
            if (!weather) {
              return <div>Please write some city</div>;
            }
            return (
              <ul>
                <li>name: {weather.name}</li>
                <li>temp: {weather.temp}</li>
                <li>feels_like: {weather.feels_like}</li>
                <li>humidity: {weather.humidity}</li>
                <li>temp_max: {weather.temp_max}</li>
                <li>temp_min: {weather.temp_min}</li>
                <li>visibility: {weather.visibility}</li>
              </ul>
            );
          }}
        />
      </div>
    );
  },
);

export async function fetchWeather(
  city: string,
  signal: AbortSignal,
): Promise<WeatherData> {
  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("q", city);
  url.searchParams.set("appid", "796dc66c4335ab39e43f882c0098b076");

  await delay(500);
  const res = await fetch(url, { signal });
  const json = await res.json();
  if (json.cod !== 200) {
    throw new Error("City not found");
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

function delay(nu: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, nu);
  });
}
