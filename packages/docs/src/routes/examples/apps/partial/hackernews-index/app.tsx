import { component$, useAsync$, useSignal, useStyles$, type Signal } from '@qwik.dev/core';
import HackerNewsCSS from './hacker-news.css?inline';

export const HackerNews = component$(() => {
  useStyles$(HackerNewsCSS);
  const page = useSignal(0);

  const data = useAsync$<IStory[]>(async ({ track, abortSignal }) => {
    const pageNum = track(page);
    const response = await fetch(`https://node-hnapi.herokuapp.com/news?page=${pageNum}`, {
      signal: abortSignal,
    });
    return await response.json();
  });

  return (
    <div class="hacker-news">
      <Nav />
      {data.loading ? <Loading /> : <Stories stories={data.value} bind:page={page} />}
    </div>
  );
});

const Loading = component$(() => {
  return <div class="loading">Loading...</div>;
});

const Nav = component$(() => {
  return (
    <nav>
      <header class="header">
        <nav class="inner">
          <a href="/">
            <strong>HN</strong>
          </a>
          <a href="/?type=new">
            <strong>New</strong>
          </a>
          <a href="/?type=show">
            <strong>Show</strong>
          </a>
          <a href="/?type=ask">
            <strong>Ask</strong>
          </a>
          <a href="/?type=job">
            <strong>Jobs</strong>
          </a>
          <a class="github" href="http://github.com/QwikDev/qwik" target="_blank" rel="noreferrer">
            Built with Qwik
          </a>
        </nav>
      </header>
    </nav>
  );
});

const Stories = component$<{ stories?: IStory[]; 'bind:page': Signal<number> }>(
  ({ stories, 'bind:page': page }) => {
    return (
      <main class="news-view">
        <section class="news-list-nav">
          {page.value > 0 ? (
            <button class="page-link" onClick$={() => (page.value -= 1)} aria-label="Previous Page">
              {'<'} prev
            </button>
          ) : (
            <span class="page-link disabled" aria-disabled="true">
              {'<'} prev
            </span>
          )}
          <span>page {page.value + 1}</span>
          {stories && stories.length >= 29 ? (
            <button class="page-link" onClick$={() => (page.value += 1)} aria-label="Next Page">
              more {'>'}
            </button>
          ) : (
            <span class="page-link disabled" aria-disabled="true">
              more {'>'}
            </span>
          )}
        </section>
        <article class="news-list">
          {stories && (
            <ul>
              {stories.map((story: IStory) => (
                <StoryPreview story={story} />
              ))}
            </ul>
          )}
        </article>
      </main>
    );
  }
);

const StoryPreview = component$<{ story: IStory }>((props) => {
  return (
    <li class="news-item">
      <span class="score">{props.story.points}</span>
      <span class="title">
        {props.story.url && !props.story.url.startsWith('item?id=') ? (
          <>
            <a href={props.story.url} target="_blank" rel="noreferrer">
              {props.story.title}
            </a>
            <span class="host"> ({props.story.domain})</span>
          </>
        ) : (
          <a href={`/item/${props.story.id}`}>{props.story.title}</a>
        )}
      </span>
      <br />
      <span class="meta">
        {props.story.type !== 'job' ? (
          <>
            by <a href={`/users/${props.story.user}`}>{props.story.user}</a> {props.story.time_ago}{' '}
            |{' '}
            <a href={`/stories/${props.story.id}`}>
              {props.story.comments_count ? `${props.story.comments_count} comments` : 'discuss'}
            </a>
          </>
        ) : (
          <a href={`/stories/${props.story.id}`}>{props.story.time_ago}</a>
        )}
      </span>
      {props.story.type !== 'link' && (
        <>
          {' '}
          <span class="label">{props.story.type}</span>
        </>
      )}
    </li>
  );
});

export interface IComment {
  id: string;
  user: string;
  time_ago: string;
  content: string;
  comments: IComment[];
}

export interface IStory {
  id: string;
  points: string;
  url: string;
  title: string;
  domain: string;
  type: string;
  time_ago: string;
  user: string;
  comments_count: number;
  comments: IComment[];
}
