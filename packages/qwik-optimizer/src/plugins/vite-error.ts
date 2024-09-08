export const VITE_ERROR_OVERLAY_STYLES = `
vite-error-overlay {
  --color-bright: rgba(255, 255, 255, 0.8);
  --color-yellow: rgba(255,246,85,0.8);
  --qwik-dark-blue: #006ce9;
  --qwik-light-blue: #3ec2f7;
  --qwik-light-purple: #ac7ff4;
  --qwik-dark-purple: #713fc2;
  --yellow: #fff;                   /* override vite yellow */
  --purple: var(--color-bright);    /* override vite purple */
  --red: var(--qwik-light-blue);    /* override vite red */

  --vertical-box-spacing: 15px;
  --box-padding: 20px;
  --box-margin: 0 0 var(--vertical-box-spacing) 0;
  --box-background: rgba(0, 0, 0, 0.5);
  --box-border-radius: 8px;
}

vite-error-overlay::part(backdrop) {
  background: rgb(2 11 17 / 60%);
  backdrop-filter: blur(20px) brightness(0.4) saturate(3);
}

vite-error-overlay::part(window) {
  background: transparent;
  border: none;
  box-shadow: none;
  box-sizing: border-box;
  margin: 50px auto;
  max-width: 1200px;
  padding: var(--box-padding);
  width: 90%;
}

vite-error-overlay::part(message) {
  display: flex;
  flex-direction: column;
  font-size: 1.6rem;
  line-height: 1.7;
  margin-bottom: 30px;
}

vite-error-overlay::part(plugin) {
  font-size: 0.8rem;
  font-weight: 100;
}

vite-error-overlay::part(file),
vite-error-overlay::part(frame),
vite-error-overlay::part(stack),
vite-error-overlay::part(tip) {
  background: var(--box-background);
  border-left: 5px solid transparent;
  border-radius: var(--box-border-radius);
  margin: var(--box-margin);
  min-height: 50px;
  padding: var(--box-padding);
  position: relative;
}

vite-error-overlay::part(file) {
  border-left-color: rgb(25 182 246);
  color: var(--color-bright);
}

vite-error-overlay::part(frame) {
  border-left-color: var(--color-yellow);
  color: var(--color-yellow);
}

vite-error-overlay::part(stack) {
  border-left-color: #FF5722;
}


vite-error-overlay::part(tip) {
  border-top: none;
  border-left-color: rgb(172, 127, 244);
}

vite-error-overlay::part(file):before,
vite-error-overlay::part(frame):before,
vite-error-overlay::part(stack):before {
  border-bottom: 1px solid #222;
  color: var(--color-bright);
  display: block;
  margin-bottom: 15px;
  padding-bottom: 5px;
  padding-left: 30px; /* space for icon */
  font-size: .8rem;
}

vite-error-overlay::part(file):before {
  content: 'File';
}

vite-error-overlay::part(frame):before {
  content: 'Frame';
}

vite-error-overlay::part(stack):before {
  content: 'Stack Trace';
}

vite-error-overlay::part(file):after,
vite-error-overlay::part(frame):after,
vite-error-overlay::part(stack):after {
  content: '';
  display: block;
  height: 20px;
  position: absolute;
  left: var(--box-padding);
  top: var(--box-padding);
  width: 20px;
}

vite-error-overlay::part(file):after {
  background-image: url("data:image/svg+xml,%3Csvg width='20px' height='20px' viewBox='0 0 24 24' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3EFile-Generic%3C/title%3E%3Cg id='Page-1' stroke='none' stroke-width='1' fill='none' fill-rule='evenodd'%3E%3Cg id='File-Generic'%3E%3Crect id='Rectangle' fill-rule='nonzero' x='0' y='0' width='24' height='24'%3E%3C/rect%3E%3Cpath d='M4 5 C4 3.89543 4.89543 3 6 3 L15.1716 3 C15.702 3 16.2107 3.21071 16.5858 3.58579 L19.4142 6.41421 C19.7893 6.78929 20 7.29799 20 7.82843 L20 19 C20 20.1046 19.1046 21 18 21 L6 21 C4.89543 21 4 20.1046 4 19 L4 5 Z' id='Path' stroke='rgba(255,255,255,0.7)' stroke-width='1' stroke-linecap='round'%3E%3C/path%3E%3Cpath d='M15 4 L15 6 C15 7.10457 15.8954 8 17 8 L19 8' id='Path' stroke='rgba(255,255,255,0.7)' stroke-width='1' stroke-linecap='round'%3E%3C/path%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}

vite-error-overlay::part(frame):after {
  background-image: url("data:image/svg+xml,%3Csvg width='20px' height='20px' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M15.6602 2.84952H19.1516C20.2555 2.84952 21.1504 3.74444 21.1504 4.84839V8.3398' stroke='rgba(255,255,255,0.7)' stroke-width='1.69904' stroke-linecap='round'/%3E%3Cpath d='M2.84949 8.33981L2.84949 4.8484C2.84949 3.74446 3.74441 2.84953 4.84836 2.84953L8.33977 2.84953' stroke='rgba(255,255,255,0.7)' stroke-width='1.69904' stroke-linecap='round'/%3E%3Cpath d='M21.1505 15.6602L21.1505 19.1516C21.1505 20.2555 20.2556 21.1505 19.1516 21.1505L15.6602 21.1505' stroke='rgba(255,255,255,0.7)' stroke-width='1.69904' stroke-linecap='round'/%3E%3Cpath d='M8.33984 21.1505L4.84843 21.1505C3.74449 21.1505 2.84956 20.2555 2.84956 19.1516L2.84956 15.6602' stroke='rgba(255,255,255,0.7)' stroke-width='1.69904' stroke-linecap='round'/%3E%3C/svg%3E");
}

vite-error-overlay::part(stack):after {
  background-image: url("data:image/svg+xml,%3Csvg width='20px' height='20px' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14.78 20H9.78C7.98 20 4.58 19.09 4.58 15.64C4.58 12.19 7.98 11.28 9.78 11.28H14.22C14.37 11.28 17.92 11.23 17.92 8.42C17.92 5.61 14.37 5.56 14.22 5.56H9.22C9.02109 5.56 8.83032 5.48098 8.68967 5.34033C8.54902 5.19968 8.47 5.00891 8.47 4.81C8.47 4.61109 8.54902 4.42032 8.68967 4.27967C8.83032 4.13902 9.02109 4.06 9.22 4.06H14.22C16.02 4.06 19.42 4.97 19.42 8.42C19.42 11.87 16.02 12.78 14.22 12.78H9.78C9.63 12.78 6.08 12.83 6.08 15.64C6.08 18.45 9.63 18.5 9.78 18.5H14.78C14.9789 18.5 15.1697 18.579 15.3103 18.7197C15.451 18.8603 15.53 19.0511 15.53 19.25C15.53 19.4489 15.451 19.6397 15.3103 19.7803C15.1697 19.921 14.9789 20 14.78 20Z' fill='rgba(255,255,255,0.7)'/%3E%3Cpath d='M6.44 8.31C5.74314 8.30407 5.06363 8.09202 4.48708 7.70056C3.91054 7.30909 3.46276 6.75573 3.20018 6.11021C2.93759 5.46469 2.87195 4.75589 3.01153 4.07312C3.1511 3.39036 3.48965 2.76418 3.9845 2.2735C4.47935 1.78281 5.10837 1.44958 5.79229 1.31579C6.47622 1.182 7.18444 1.25363 7.82771 1.52167C8.47099 1.78971 9.02054 2.24215 9.40711 2.82199C9.79368 3.40182 9.99998 4.08311 10 4.78C10 5.2461 9.90773 5.70759 9.72846 6.13783C9.54919 6.56808 9.28648 6.95856 8.95551 7.28675C8.62453 7.61494 8.23184 7.87433 7.80009 8.04995C7.36834 8.22558 6.90609 8.31396 6.44 8.31ZM6.44 2.75C6.04444 2.75 5.65776 2.86729 5.32886 3.08706C4.99996 3.30682 4.74362 3.61918 4.59224 3.98463C4.44087 4.35008 4.40126 4.75221 4.47843 5.14018C4.5556 5.52814 4.74609 5.8845 5.02579 6.16421C5.3055 6.44391 5.66186 6.6344 6.04982 6.71157C6.43779 6.78874 6.83992 6.74913 7.20537 6.59776C7.57082 6.44638 7.88318 6.19003 8.10294 5.86114C8.32271 5.53224 8.44 5.14556 8.44 4.75C8.44 4.48735 8.38827 4.22728 8.28776 3.98463C8.18725 3.74198 8.03993 3.5215 7.85422 3.33578C7.6685 3.15007 7.44802 3.00275 7.20537 2.90224C6.96272 2.80173 6.70265 2.75 6.44 2.75Z' fill='rgba(255,255,255,0.7)'/%3E%3Cpath d='M17.56 22.75C16.8614 22.752 16.1779 22.5466 15.5961 22.1599C15.0143 21.7733 14.5603 21.2227 14.2916 20.5778C14.0229 19.933 13.9515 19.2229 14.0866 18.5375C14.2217 17.8521 14.5571 17.2221 15.0504 16.7275C15.5437 16.2328 16.1726 15.8956 16.8577 15.7586C17.5427 15.6215 18.253 15.6909 18.8986 15.9577C19.5442 16.2246 20.0961 16.6771 20.4844 17.2578C20.8727 17.8385 21.08 18.5214 21.08 19.22C21.08 20.1545 20.7095 21.0508 20.0496 21.7125C19.3898 22.3743 18.4945 22.7473 17.56 22.75ZM17.56 17.19C17.1644 17.19 16.7778 17.3073 16.4489 17.5271C16.12 17.7468 15.8636 18.0592 15.7122 18.4246C15.5609 18.7901 15.5213 19.1922 15.5984 19.5802C15.6756 19.9681 15.8661 20.3245 16.1458 20.6042C16.4255 20.8839 16.7819 21.0744 17.1698 21.1516C17.5578 21.2287 17.9599 21.1891 18.3254 21.0377C18.6908 20.8864 19.0032 20.63 19.2229 20.3011C19.4427 19.9722 19.56 19.5856 19.56 19.19C19.56 18.6596 19.3493 18.1508 18.9742 17.7758C18.5991 17.4007 18.0904 17.19 17.56 17.19Z' fill='rgba(255,255,255,0.7)'/%3E%3C/svg%3E");
}

vite-error-overlay::part(tip):before {
  content: "Not sure how to solve this? Visit https://qwik.dev or connect with the community on Discord.";
  display: block;
  margin-bottom: 1em;
}
`;
