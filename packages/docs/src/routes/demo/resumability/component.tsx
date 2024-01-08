import {
  type PropsOf,
  component$,
  useStylesScoped$,
  Slot,
} from '@builder.io/qwik';
import CSS from './component.css?inline';
import { type HoverEvent } from './index';

export const UnderstandingResumability = component$(() => {
  useStylesScoped$(CSS);
  return (
    <div class="demo">
      <div class="hydration">
        <div class="strategy">Hydration</div>

        <div class="thread">
          <div class="thread-label">(main)</div>
          <div class="group">
            <div
              class="html box"
              onHover$={(e: HoverEvent) =>
                e.detail(
                  <Callout target={e.target as HTMLElement}>
                    <p>
                      Server side rendered HTML to show application instantly
                    </p>
                    <ul>
                      <li>HTML from CDN (or SSG)</li>
                    </ul>
                  </Callout>
                )
              }
            />
            <div
              class="js box"
              onHover$={(e: HoverEvent) =>
                e.detail(
                  <Callout target={e.target as HTMLElement}>
                    <p>HTML triggers downloading of application JavaScript.</p>
                    <ul>
                      <li>
                        Duplication: JS contains all string which are in HTML.
                      </li>
                      <li>
                        Any user interactions are lost (unless some form of
                        event replay system exist.)
                      </li>
                    </ul>
                  </Callout>
                )
              }
            />
            <div
              class="execution box"
              onHover$={(e: HoverEvent) =>
                e.detail(
                  <Callout target={e.target as HTMLElement}>
                    <p>
                      The application must be executed for the framework to
                      collect listeners, components, and state.
                    </p>
                    <ul>
                      <li>
                        This is a recursive process which starts with root
                        component.
                      </li>
                      <li>
                        The code is executed in slow interpretive mode (no
                        JIT.)
                      </li>
                    </ul>
                  </Callout>
                )
              }
            />
            <div
              class="reconciliation box"
              onHover$={(e: HoverEvent) =>
                e.detail(
                  <Callout target={e.target as HTMLElement}>
                    <p>
                      Events are attached to make the application interactive.
                    </p>
                  </Callout>
                )
              }
            />
            <div
              onHover$={(e: HoverEvent) =>
                e.detail(
                  <Callout target={e.target as HTMLElement}>
                    <p>Application can now be interacted with.</p>
                  </Callout>
                )
              }
            >
              <ReadyIcon />
            </div>
          </div>
        </div>
      </div>
      <div class="space"></div>
      <div class="resumability">
        <div class="strategy">Resumability</div>
        <div class="thread">
          <div class="thread-label">(main)</div>
          <div class="group">
            <div
              class="html box"
              onHover$={(e: HoverEvent) =>
                e.detail(
                  <Callout target={e.target as HTMLElement}>
                    <p>
                      Server side rendered HTML to show application instantly
                    </p>
                    <ul>
                      <li>HTML from CDN (or SSG)</li>
                      <li>Contains QwikLoader global listener (1kb / ~1ms)</li>
                    </ul>
                  </Callout>
                )
              }
            ></div>
            <div
              onHover$={(e: HoverEvent) =>
                e.detail(
                  <Callout target={e.target as HTMLElement}>
                    <p>Application can now be interacted with.</p>
                    <ul>
                      <li>Notice that JS is downloaded in parallel.</li>
                      <li>
                        In an unlikely event that user interacts before JS is
                        downloaded there may be small delay. (But always less
                        than hydration cost.)
                      </li>
                    </ul>
                  </Callout>
                )
              }
            >
              <ReadyIcon />
            </div>
          </div>
        </div>
        <div class="thread">
          <div class="thread-label">(worker)</div>
          <div
            class="group"
            style={{ 'margin-left': '120px' }}
            onHover$={(e: HoverEvent) =>
              e.detail(
                <Callout target={e.target as HTMLElement}>
                  <p>JavaScript downloaded in parallel.</p>
                  <ul>
                    <li>
                      JS is eagerly downloaded in service worker off the main
                      thread into browser cache. Once downloaded the
                      application interactivity does not depend on network.
                    </li>
                    <li>
                      JS is not brought to main thread until user interaction.
                      This keeps main thread free for other tasks.
                    </li>
                    <li>
                      JS is split into many smaller chunks, this allows the
                      service worker to prioritize the order of chunk download
                      in case user interacts before all JS is downloaded.
                    </li>
                    <li>
                      Related code is automatically grouped into chunks so that
                      each chunk only has what is needed to process user
                      interaction.
                    </li>
                  </ul>
                </Callout>
              )
            }
          >
            <div class="js-chunk box"></div>
            <div class="js-chunk box"></div>
            <div class="js-chunk box"></div>
            <div class="js-chunk box"></div>
            <div class="js-chunk box"></div>
          </div>
        </div>
      </div>
      <h1 class="label">Legend</h1>
      <div class="legend">
        <div class="group">
          <div class="html legend-box" />
          <div class="label">HTML</div>
        </div>
        <div class="group">
          <div class="js legend-box" />
          <div class="label">JS download</div>
        </div>
        <div class="group">
          <div class="execution legend-box" />
          <div class="label">JS execution</div>
        </div>
        <div class="group">
          <div class="reconciliation legend-box" />
          <div class="label">DOM Listeners</div>
        </div>
        <div class="group">
          <div class="legend-box">
            <ReadyIcon />
          </div>
          <div class="label">Ready</div>
        </div>
      </div>
    </div>
  );
});

export function ReadyIcon(props: PropsOf<'svg'>, key: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="3em"
      height="3em"
      viewBox="0 0 48 48"
      {...props}
      key={key}
    >
      <g
        fill="green"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      >
        <path d="M24 4v8"></path>
        <path
          d="m22 22l20 4l-6 4l6 6l-6 6l-6-6l-4 6l-4-20Z"
          clip-rule="evenodd"
        ></path>
        <path d="m38.142 9.858l-5.657 5.657M9.858 38.142l5.657-5.657M4 24h8M9.858 9.858l5.657 5.657"></path>
      </g>
    </svg>
  );
}

export const Callout = component$<{ target: HTMLElement }>(({ target }) => {
  const rect = target.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height;
  return (
    <div
      style={{
        position: 'absolute',
        top: y + 'px',
        left: x + 'px',
        border: '1px solid black',
        backgroundColor: 'white',
        color: 'black',
        padding: '.5em',
      }}
    >
      <Slot />
    </div>
  );
});
