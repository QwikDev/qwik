import { component$ } from '@builder.io/qwik';
import { DocumentHead, Link, loader$, useLocation } from '@builder.io/qwik-city';

export const useWeatherLoader = loader$(({ params, query }) => {
  return {
    city: params.city,
    country: params.country,
    temperature: 30,
    unit: query.get('unit') || 'C',
    forecast: query.get('forecast') || '10day',
  };
});

export default component$(() => {
  const loc = useLocation();
  const weather = useWeatherLoader().value;

  return (
    <>
      <h1>Weather</h1>
      <p>
        <span>loc.params.country: </span>
        <code data-test-params="country">{loc.params.country}</code>
      </p>
      <p>
        <span>resource weather.city: </span>
        <code data-test-params="city">{weather.city}</code>
      </p>
      <p>
        <span>resource weather.temperature: </span>
        <code data-test-params="temperature">{weather.temperature}</code>
        <code>&deg; </code>
      </p>
      <p>
        <span>loc.query.get('unit'): </span>
        <code data-test-params="unit">{loc.query.get('unit') || 'C'}</code>
      </p>
      <p>
        <span>resource weather.forecast: </span>
        <code data-test-params="forecast">{weather.forecast}</code>
      </p>
      <ul>
        <li>
          <Link href="/qwikcity-test/usa/astoria/">Astoria, OR, USA</Link>
        </li>
        <li>
          <Link href="/qwikcity-test/usa/hill-valley/?unit=F&forecast=24hour">
            Hill Valley, CA, USA
          </Link>
        </li>
      </ul>
    </>
  );
});

export const head: DocumentHead = ({ getData, params, query }) => {
  const weather = getData(useWeatherLoader);
  const forecast = query.get('forecast') || '10day';

  return {
    title: `Weather: ${weather.country} ${params.city}, ${weather.temperature}${weather.unit}, ${forecast}`,
  };
};
