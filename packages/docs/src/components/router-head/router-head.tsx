/* eslint-disable no-console */
import { component$,  useTask$ } from '@builder.io/qwik';
import {  useDocumentHead, useLocation } from '@builder.io/qwik-city';
import { Social } from './social';
import { Vendor } from './vendor';
import { ThemeScript } from './theme-script';




export const RouterHead = component$(() => {


  const { url } = useLocation();
  const head = useDocumentHead();
  const title = head.title
    ? `${head.title} 📚 Qwik Documentation`
    : `Qwik - Framework reimagined for the edge`;
  const description =
    head.meta.find((m) => m.name === 'description')?.content ||
    `No hydration, auto lazy-loading, edge-optimized, and fun 🎉!`;

  const pageTitle = head.title;

  const ogImageUrl = new URL('https://opengraphqwik.vercel.app/api/og');

  //turn the title into array
  const arrayedTitle = pageTitle.split(' | ');

  //check if we are on home page or level 0 or 1 route
  let isBaseRoute = true;
  isBaseRoute = arrayedTitle.length > 0 ? false : true;

  


  const OGImage= {


    isBaseRoute:arrayedTitle.length > 0 ? false : true,
     routeLevelX:0,
       imageURL:"",
    ogImgTitle:"",
    ogImgSubTitle:"",

get URL(){

console.log(this.isBaseRoute)

  // set the text for the ogimage
  const biggerTitle = isBaseRoute ? undefined : arrayedTitle[0];
  // console.log("biggerTitle ", biggerTitle)
  const smallerTitle = isBaseRoute ? undefined : arrayedTitle[1];
  // console.log("smallerTitle ", smallerTitle)



  this.ogImgTitle = biggerTitle as any;
  this.ogImgSubTitle= smallerTitle  as any;




    //decide whether or not to show subtitle
    if (this.ogImgSubTitle == undefined || this.ogImgTitle == undefined) {
      this.ogImgTitle = biggerTitle  as any;

      this.routeLevelX = 0;
      // console.log("you are currently on level ", this.routeLevelX)
      this.imageURL = new URL(`/logos/social-card.jpg`, url).href;

// console.log("your image url is ", this.imageURL)
return this.imageURL


    } else {
      this.routeLevelX = 1;
      // console.log("you are currently on level ", this.routeLevelX)

      ogImageUrl.searchParams.set('title', this.ogImgTitle);
      ogImageUrl.searchParams.set('subtitle', this.ogImgSubTitle);
      ogImageUrl.searchParams.set('level', this.routeLevelX.toString());

      // console.log("2222 ", this.imageURL)

      this.imageURL = ogImageUrl.toString();
      console.log("333333 ", true)
      return this.imageURL
    }


  // return "kkkk"
}


  }



  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url.href} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="apple-mobile-web-app-title" content="Qwik" />
      <meta name="application-name" content="Qwik" />
      <meta name="apple-mobile-web-app-title" content="Qwik" />
      <meta name="theme-color" content="#006ce9" />
      <meta name="color-scheme" content="dark light" />

      <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
      <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />

      {/* {import.meta.env.PROD && ( */}
        <>
          <Social
            title={title}
            description={description}
            href={url.href}
            ogImage={OGImage.URL}
          />
          <Vendor />
        </>
      {/* )} */}

      {head.meta
        // Skip description because that was already added at the top
        .filter((s) => s.name !== 'description')
        .map((m, key) => (
          <meta key={key} {...m} />
        ))}

      {head.links.map((l, key) => (
        <link key={key} {...l} />
      ))}

      {head.styles.map((s, key) => (
        <style key={key} {...s.props} dangerouslySetInnerHTML={s.style} />
      ))}

      <ThemeScript />
    </>
  );
});
