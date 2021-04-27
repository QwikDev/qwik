/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from '../../import/qrl.js';

declare global {
  // TODO:  Maybe we can get rid of `QAttrs` if we move content to `*:*` props, that way better types
  interface QAttrs {
    [key: string]: any;
  }

  namespace JSX {
    interface IntrinsicElements {
      a: JSXHTMLAnchorElement;
      abbr: JSXHTMLElement;
      address: JSXHTMLElement;
      area: JSXHTMLAreaElement;
      article: JSXHTMLElement;
      aside: JSXHTMLElement;
      b: JSXHTMLElement;
      base: JSXHTMLBaseElement;
      bdi: JSXHTMLElement;
      bdo: JSXHTMLElement;
      blockquote: JSXHTMLQuoteElement;
      body: JSXHTMLBodyElement;
      br: JSXHTMLBRElement;
      button: JSXHTMLButtonElement;
      canvas: JSXHTMLCanvasElement;
      caption: JSXHTMLTableCaptionElement;
      cite: JSXHTMLElement;
      code: JSXHTMLElement;
      col: JSXHTMLTableColElement;
      colgroup: JSXHTMLTableColElement;
      data: JSXHTMLDataElement;
      datalist: JSXHTMLDataListElement;
      dd: JSXHTMLElement;
      del: JSXHTMLModElement;
      details: JSXHTMLDetailsElement;
      dfn: JSXHTMLElement;
      dialog: JSXHTMLDialogElement;
      div: JSXHTMLDivElement;
      dl: JSXHTMLDListElement;
      dt: JSXHTMLElement;
      em: JSXHTMLElement;
      embed: JSXHTMLEmbedElement;
      fieldset: JSXHTMLFieldSetElement;
      figure: JSXHTMLElement;
      footer: JSXHTMLElement;
      form: JSXHTMLFormElement;
      h1: JSXHTMLHeadingElement;
      h2: JSXHTMLHeadingElement;
      h3: JSXHTMLHeadingElement;
      h4: JSXHTMLHeadingElement;
      h5: JSXHTMLHeadingElement;
      h6: JSXHTMLHeadingElement;
      head: JSXHTMLHeadElement;
      header: JSXHTMLElement;
      hgroup: JSXHTMLElement;
      hr: JSXHTMLHRElement;
      html: JSXHTMLHtmlElement;
      i: JSXHTMLElement;
      iframe: JSXHTMLIFrameElement;
      img: JSXHTMLImageElement;
      input: JSXHTMLInputElement;
      ins: JSXHTMLModElement;
      kbd: JSXHTMLElement;
      keygen: JSXHTMLUnknownElement;
      label: JSXHTMLLabelElement;
      legend: JSXHTMLLegendElement;
      li: JSXHTMLLIElement;
      link: JSXHTMLLinkElement;
      main: JSXHTMLElement;
      map: JSXHTMLMapElement;
      mark: JSXHTMLElement;
      menu: JSXHTMLMenuElement;
      menuitem: JSXHTMLUnknownElement;
      meta: JSXHTMLMetaElement;
      meter: JSXHTMLMeterElement;
      nav: JSXHTMLElement;
      noscript: JSXHTMLElement;
      object: JSXHTMLObjectElement;
      ol: JSXHTMLOListElement;
      optgroup: JSXHTMLOptGroupElement;
      option: JSXHTMLOptionElement;
      output: JSXHTMLOutputElement;
      p: JSXHTMLParagraphElement;
      param: JSXHTMLParamElement;
      pre: JSXHTMLPreElement;
      progress: JSXHTMLProgressElement;
      q: JSXHTMLQuoteElement;
      rb: JSXHTMLElement;
      rp: JSXHTMLElement;
      rt: JSXHTMLElement;
      rtc: JSXHTMLElement;
      ruby: JSXHTMLElement;
      s: JSXHTMLElement;
      samp: JSXHTMLElement;
      script: JSXHTMLScriptElement;
      section: JSXHTMLElement;
      select: JSXHTMLSelectElement;
      small: JSXHTMLElement;
      source: JSXHTMLSourceElement;
      span: JSXHTMLSpanElement;
      strong: JSXHTMLElement;
      style: JSXHTMLStyleElement;
      sub: JSXHTMLElement;
      summary: JSXHTMLElement;
      sup: JSXHTMLElement;
      table: JSXHTMLTableElement;
      tbody: JSXHTMLTableSectionElement;
      td: JSXHTMLTableCellElement;
      template: JSXHTMLTemplateElement;
      textarea: JSXHTMLTextAreaElement;
      tfoot: JSXHTMLTableSectionElement;
      th: JSXHTMLTableCellElement;
      thead: JSXHTMLTableSectionElement;
      time: JSXHTMLTimeElement;
      title: JSXHTMLTitleElement;
      tr: JSXHTMLTableRowElement;
      track: JSXHTMLTrackElement;
      u: JSXHTMLElement;
      ul: JSXHTMLUListElement;
      var: JSXHTMLElement;
      video: JSXHTMLVideoElement;
      wbr: JSXHTMLElement;
    }
    interface JSXHTMLAnchorElement extends JSXHTMLElement {
      charset?: string;
      coords?: string;
      download?: string;
      hash?: string;
      host?: string;
      hostname?: string;
      href?: string;
      hreflang?: string;
      name?: string;
      origin?: string;
      password?: string;
      pathname?: string;
      ping?: string;
      port?: string;
      protocol?: string;
      rel?: string;
      rev?: string;
      search?: string;
      shape?: string;
      target?: string;
      text?: string;
      type?: string;
      username?: string;
    }

    interface JSXHTMLElement extends JSXElement {
      'on:abort'?: QRL;
      'on:animationend'?: QRL;
      'on:animationiteration'?: QRL;
      'on:animationstart'?: QRL;
      'on:auxclick'?: QRL;
      'on:beforexrselect'?: QRL;
      'on:blur'?: QRL;
      'on:cancel'?: QRL;
      'on:canplay'?: QRL;
      'on:canplaythrough'?: QRL;
      'on:change'?: QRL;
      'on:click'?: QRL;
      'on:close'?: QRL;
      'on:contextmenu'?: QRL;
      'on:copy'?: QRL;
      'on:cuechange'?: QRL;
      'on:cut'?: QRL;
      'on:dblclick'?: QRL;
      'on:drag'?: QRL;
      'on:dragend'?: QRL;
      'on:dragenter'?: QRL;
      'on:dragleave'?: QRL;
      'on:dragover'?: QRL;
      'on:dragstart'?: QRL;
      'on:drop'?: QRL;
      'on:durationchange'?: QRL;
      'on:emptied'?: QRL;
      'on:ended'?: QRL;
      'on:error'?: QRL;
      'on:focus'?: QRL;
      'on:formdata'?: QRL;
      'on:gotpointercapture'?: QRL;
      'on:input'?: QRL;
      'on:invalid'?: QRL;
      'on:keydown'?: QRL;
      'on:keypress'?: QRL;
      'on:keyup'?: QRL;
      'on:load'?: QRL;
      'on:loadeddata'?: QRL;
      'on:loadedmetadata'?: QRL;
      'on:loadstart'?: QRL;
      'on:lostpointercapture'?: QRL;
      'on:mousedown'?: QRL;
      'on:mouseenter'?: QRL;
      'on:mouseleave'?: QRL;
      'on:mousemove'?: QRL;
      'on:mouseout'?: QRL;
      'on:mouseover'?: QRL;
      'on:mouseup'?: QRL;
      'on:mousewheel'?: QRL;
      'on:paste'?: QRL;
      'on:pause'?: QRL;
      'on:play'?: QRL;
      'on:playing'?: QRL;
      'on:pointercancel'?: QRL;
      'on:pointerdown'?: QRL;
      'on:pointerenter'?: QRL;
      'on:pointerleave'?: QRL;
      'on:pointermove'?: QRL;
      'on:pointerout'?: QRL;
      'on:pointerover'?: QRL;
      'on:pointerrawupdate'?: QRL;
      'on:pointerup'?: QRL;
      'on:progress'?: QRL;
      'on:ratechange'?: QRL;
      'on:reset'?: QRL;
      'on:resize'?: QRL;
      'on:scroll'?: QRL;
      'on:seeked'?: QRL;
      'on:seeking'?: QRL;
      'on:select'?: QRL;
      'on:selectionchange'?: QRL;
      'on:selectstart'?: QRL;
      'on:stalled'?: QRL;
      'on:submit'?: QRL;
      'on:suspend'?: QRL;
      'on:timeupdate'?: QRL;
      'on:toggle'?: QRL;
      'on:transitioncancel'?: QRL;
      'on:transitionend'?: QRL;
      'on:transitionrun'?: QRL;
      'on:transitionstart'?: QRL;
      'on:volumechange'?: QRL;
      'on:waiting'?: QRL;
      'on:webkitanimationend'?: QRL;
      'on:webkitanimationiteration'?: QRL;
      'on:webkitanimationstart'?: QRL;
      'on:webkittransitionend'?: QRL;
      'on:wheel'?: QRL;
      accessKey?: string;
      autocapitalize?: string;
      autofocus?: boolean;
      contentEditable?: string;
      dir?: string;
      draggable?: boolean;
      enterKeyHint?: string;
      hidden?: boolean;
      isContentEditable?: boolean;
      lang?: string;
      nonce?: string;
      offsetHeight?: number;
      offsetLeft?: number;
      offsetTop?: number;
      offsetWidth?: number;
      spellcheck?: boolean;
      tabIndex?: number;
      title?: string;
      translate?: boolean;
    }

    interface JSXElement {
      $?: QAttrs;
      'on:beforecopy'?: QRL;
      'on:beforecut'?: QRL;
      'on:beforepaste'?: QRL;
      'on:fullscreenchange'?: QRL;
      'on:fullscreenerror'?: QRL;
      'on:search'?: QRL;
      'on:webkitfullscreenchange'?: QRL;
      'on:webkitfullscreenerror'?: QRL;
      ariaAtomic?: string;
      ariaAutoComplete?: string;
      ariaBusy?: string;
      ariaChecked?: string;
      ariaColCount?: string;
      ariaColIndex?: string;
      ariaColSpan?: string;
      ariaCurrent?: string;
      ariaDescription?: string;
      ariaDisabled?: string;
      ariaExpanded?: string;
      ariaHasPopup?: string;
      ariaHidden?: string;
      ariaKeyShortcuts?: string;
      ariaLabel?: string;
      ariaLevel?: string;
      ariaLive?: string;
      ariaModal?: string;
      ariaMultiLine?: string;
      ariaMultiSelectable?: string;
      ariaOrientation?: string;
      ariaPlaceholder?: string;
      ariaPosInSet?: string;
      ariaPressed?: string;
      ariaReadOnly?: string;
      ariaRelevant?: string;
      ariaRequired?: string;
      ariaRoleDescription?: string;
      ariaRowCount?: string;
      ariaRowIndex?: string;
      ariaRowSpan?: string;
      ariaSelected?: string;
      ariaSetSize?: string;
      ariaSort?: string;
      ariaValueMax?: string;
      ariaValueMin?: string;
      ariaValueNow?: string;
      ariaValueText?: string;
      class?: string | string[] | Record<string, boolean>;
      id?: string;
      innerHTML?: string;
      style?: string | Record<string, string>;
    }

    interface JSXHTMLAreaElement extends JSXHTMLElement {
      alt?: string;
      coords?: string;
      download?: string;
      hash?: string;
      host?: string;
      hostname?: string;
      href?: string;
      noHref?: boolean;
      origin?: string;
      password?: string;
      pathname?: string;
      ping?: string;
      port?: string;
      protocol?: string;
      rel?: string;
      search?: string;
      shape?: string;
      target?: string;
      username?: string;
    }

    interface JSXHTMLBaseElement extends JSXHTMLElement {
      href?: string;
      target?: string;
    }

    interface JSXHTMLQuoteElement extends JSXHTMLElement {
      cite?: string;
    }

    interface JSXHTMLBodyElement extends JSXHTMLElement {
      'on:afterprint'?: QRL;
      'on:beforeprint'?: QRL;
      'on:beforeunload'?: QRL;
      'on:blur'?: QRL;
      'on:error'?: QRL;
      'on:focus'?: QRL;
      'on:hashchange'?: QRL;
      'on:languagechange'?: QRL;
      'on:load'?: QRL;
      'on:message'?: QRL;
      'on:messageerror'?: QRL;
      'on:offline'?: QRL;
      'on:online'?: QRL;
      'on:pagehide'?: QRL;
      'on:pageshow'?: QRL;
      'on:popstate'?: QRL;
      'on:rejectionhandled'?: QRL;
      'on:resize'?: QRL;
      'on:scroll'?: QRL;
      'on:storage'?: QRL;
      'on:unhandledrejection'?: QRL;
      'on:unload'?: QRL;
      aLink?: string;
      background?: string;
      bgColor?: string;
      link?: string;
      text?: string;
      vLink?: string;
    }

    interface JSXHTMLBRElement extends JSXHTMLElement {
      clear?: string;
    }

    interface JSXHTMLButtonElement extends JSXHTMLElement {
      disabled?: boolean;
      form?: string;
      formAction?: string;
      formEnctype?: string;
      formMethod?: string;
      formNoValidate?: boolean;
      formTarget?: string;
      name?: string;
      type?: string;
      validationMessage?: string;
      value?: string;
      willValidate?: boolean;
    }

    interface JSXHTMLCanvasElement extends JSXHTMLElement {
      height?: number;
      width?: number;
    }

    interface JSXHTMLTableCaptionElement extends JSXHTMLElement {
      align?: string;
    }

    interface JSXHTMLTableColElement extends JSXHTMLElement {
      align?: string;
      ch?: string;
      chOff?: string;
      span?: number;
      vAlign?: string;
      width?: string;
    }

    interface JSXHTMLDataElement extends JSXHTMLElement {
      value?: string;
    }

    interface JSXHTMLDataListElement extends JSXHTMLElement {}

    interface JSXHTMLModElement extends JSXHTMLElement {
      cite?: string;
      dateTime?: string;
    }

    interface JSXHTMLDetailsElement extends JSXHTMLElement {
      open?: boolean;
    }

    interface JSXHTMLDialogElement extends JSXHTMLElement {
      open?: boolean;
      returnValue?: string;
    }

    interface JSXHTMLDivElement extends JSXHTMLElement {
      align?: string;
    }

    interface JSXHTMLDListElement extends JSXHTMLElement {
      compact?: boolean;
    }

    interface JSXHTMLEmbedElement extends JSXHTMLElement {
      align?: string;
      height?: string;
      name?: string;
      src?: string;
      type?: string;
      width?: string;
    }

    interface JSXHTMLFieldSetElement extends JSXHTMLElement {
      disabled?: boolean;
      form?: string;
      name?: string;
      type?: string;
      validationMessage?: string;
      willValidate?: boolean;
    }

    interface JSXHTMLFormElement extends JSXHTMLElement {
      acceptCharset?: string;
      action?: string;
      autocomplete?: string;
      encoding?: string;
      enctype?: string;
      length?: number;
      method?: string;
      name?: string;
      noValidate?: boolean;
      target?: string;
    }

    interface JSXHTMLHeadingElement extends JSXHTMLElement {
      align?: string;
    }

    interface JSXHTMLHeadElement extends JSXHTMLElement {}

    interface JSXHTMLHRElement extends JSXHTMLElement {
      align?: string;
      color?: string;
      noShade?: boolean;
      size?: string;
      width?: string;
    }

    interface JSXHTMLHtmlElement extends JSXHTMLElement {
      version?: string;
    }

    interface JSXHTMLIFrameElement extends JSXHTMLElement {
      align?: string;
      allow?: string;
      allowFullscreen?: boolean;
      allowPaymentRequest?: boolean;
      contentDocument?: string;
      contentWindow?: string;
      csp?: string;
      frameBorder?: string;
      height?: string;
      loading?: string;
      longDesc?: string;
      marginHeight?: string;
      marginWidth?: string;
      name?: string;
      scrolling?: string;
      src?: string;
      srcdoc?: string;
      width?: string;
    }

    interface JSXHTMLImageElement extends JSXHTMLElement {
      align?: string;
      alt?: string;
      border?: string;
      complete?: boolean;
      crossOrigin?: string;
      currentSrc?: string;
      decoding?: string;
      height?: number;
      hspace?: number;
      isMap?: boolean;
      loading?: string;
      longDesc?: string;
      lowsrc?: string;
      name?: string;
      naturalHeight?: number;
      naturalWidth?: number;
      sizes?: string;
      src?: string;
      srcset?: string;
      useMap?: string;
      vspace?: number;
      width?: number;
      x?: number;
      y?: number;
    }

    interface JSXHTMLInputElement extends JSXHTMLElement {
      accept?: string;
      align?: string;
      alt?: string;
      autocomplete?: string;
      checked?: boolean;
      defaultChecked?: boolean;
      defaultValue?: string;
      dirName?: string;
      disabled?: boolean;
      files?: string;
      form?: string;
      formAction?: string;
      formEnctype?: string;
      formMethod?: string;
      formNoValidate?: boolean;
      formTarget?: string;
      height?: number;
      incremental?: boolean;
      indeterminate?: boolean;
      list?: string;
      max?: string;
      maxLength?: number;
      min?: string;
      minLength?: number;
      multiple?: boolean;
      name?: string;
      pattern?: string;
      placeholder?: string;
      readOnly?: boolean;
      required?: boolean;
      selectionDirection?: string;
      selectionEnd?: number;
      selectionStart?: number;
      size?: number;
      src?: string;
      step?: string;
      type?: string;
      useMap?: string;
      validationMessage?: string;
      value?: string;
      valueAsDate?: string;
      valueAsNumber?: number;
      webkitdirectory?: boolean;
      width?: number;
      willValidate?: boolean;
    }

    interface JSXHTMLUnknownElement extends JSXHTMLElement {}

    interface JSXHTMLLabelElement extends JSXHTMLElement {
      control?: string;
      form?: string;
      htmlFor?: string;
    }

    interface JSXHTMLLegendElement extends JSXHTMLElement {
      align?: string;
      form?: string;
    }

    interface JSXHTMLLIElement extends JSXHTMLElement {
      type?: string;
      value?: number;
    }

    interface JSXHTMLLinkElement extends JSXHTMLElement {
      as?: string;
      charset?: string;
      crossOrigin?: string;
      disabled?: boolean;
      href?: string;
      hreflang?: string;
      imageSizes?: string;
      imageSrcset?: string;
      integrity?: string;
      media?: string;
      rel?: string;
      rev?: string;
      sheet?: string;
      target?: string;
      type?: string;
    }

    interface JSXHTMLMapElement extends JSXHTMLElement {
      name?: string;
    }

    interface JSXHTMLMenuElement extends JSXHTMLElement {
      compact?: boolean;
    }

    interface JSXHTMLMetaElement extends JSXHTMLElement {
      content?: string;
      httpEquiv?: string;
      name?: string;
      scheme?: string;
    }

    interface JSXHTMLMeterElement extends JSXHTMLElement {
      high?: number;
      low?: number;
      max?: number;
      min?: number;
      optimum?: number;
      value?: number;
    }

    interface JSXHTMLObjectElement extends JSXHTMLElement {
      align?: string;
      archive?: string;
      border?: string;
      code?: string;
      codeBase?: string;
      codeType?: string;
      contentDocument?: string;
      contentWindow?: string;
      data?: string;
      declare?: boolean;
      form?: string;
      height?: string;
      hspace?: number;
      name?: string;
      standby?: string;
      type?: string;
      useMap?: string;
      validationMessage?: string;
      vspace?: number;
      width?: string;
      willValidate?: boolean;
    }

    interface JSXHTMLOListElement extends JSXHTMLElement {
      compact?: boolean;
      reversed?: boolean;
      start?: number;
      type?: string;
    }

    interface JSXHTMLOptGroupElement extends JSXHTMLElement {
      disabled?: boolean;
      label?: string;
    }

    interface JSXHTMLOptionElement extends JSXHTMLElement {
      defaultSelected?: boolean;
      disabled?: boolean;
      form?: string;
      index?: number;
      label?: string;
      selected?: boolean;
      text?: string;
      value?: string;
    }

    interface JSXHTMLOutputElement extends JSXHTMLElement {
      defaultValue?: string;
      form?: string;
      name?: string;
      type?: string;
      validationMessage?: string;
      value?: string;
      willValidate?: boolean;
    }

    interface JSXHTMLParagraphElement extends JSXHTMLElement {
      align?: string;
    }

    interface JSXHTMLParamElement extends JSXHTMLElement {
      name?: string;
      type?: string;
      value?: string;
      valueType?: string;
    }

    interface JSXHTMLPreElement extends JSXHTMLElement {
      width?: number;
    }

    interface JSXHTMLProgressElement extends JSXHTMLElement {
      max?: number;
      position?: number;
      value?: number;
    }

    interface JSXHTMLScriptElement extends JSXHTMLElement {
      async?: boolean;
      charset?: string;
      crossOrigin?: string;
      defer?: boolean;
      event?: string;
      events?: string;
      htmlFor?: string;
      integrity?: string;
      noModule?: boolean;
      src?: string;
      text?: string;
      type?: string;
    }

    interface JSXHTMLSelectElement extends JSXHTMLElement {
      autocomplete?: string;
      disabled?: boolean;
      form?: string;
      length?: number;
      multiple?: boolean;
      name?: string;
      required?: boolean;
      selectedIndex?: number;
      size?: number;
      type?: string;
      validationMessage?: string;
      value?: string;
      willValidate?: boolean;
    }

    interface JSXHTMLSourceElement extends JSXHTMLElement {
      height?: number;
      media?: string;
      sizes?: string;
      src?: string;
      srcset?: string;
      type?: string;
      width?: number;
    }

    interface JSXHTMLSpanElement extends JSXHTMLElement {}

    interface JSXHTMLStyleElement extends JSXHTMLElement {
      disabled?: boolean;
      media?: string;
      sheet?: string;
      type?: string;
    }

    interface JSXHTMLTableElement extends JSXHTMLElement {
      align?: string;
      bgColor?: string;
      border?: string;
      caption?: string;
      cellPadding?: string;
      cellSpacing?: string;
      frame?: string;
      rules?: string;
      summary?: string;
      tFoot?: string;
      tHead?: string;
      width?: string;
    }

    interface JSXHTMLTableSectionElement extends JSXHTMLElement {
      align?: string;
      ch?: string;
      chOff?: string;
      vAlign?: string;
    }

    interface JSXHTMLTableCellElement extends JSXHTMLElement {
      abbr?: string;
      align?: string;
      axis?: string;
      bgColor?: string;
      cellIndex?: number;
      ch?: string;
      chOff?: string;
      colSpan?: number;
      headers?: string;
      height?: string;
      noWrap?: boolean;
      rowSpan?: number;
      scope?: string;
      vAlign?: string;
      width?: string;
    }

    interface JSXHTMLTemplateElement extends JSXHTMLElement {}

    interface JSXHTMLTextAreaElement extends JSXHTMLElement {
      autocomplete?: string;
      cols?: number;
      defaultValue?: string;
      dirName?: string;
      disabled?: boolean;
      form?: string;
      maxLength?: number;
      minLength?: number;
      name?: string;
      placeholder?: string;
      readOnly?: boolean;
      required?: boolean;
      rows?: number;
      selectionDirection?: string;
      selectionEnd?: number;
      selectionStart?: number;
      textLength?: number;
      type?: string;
      validationMessage?: string;
      value?: string;
      willValidate?: boolean;
      wrap?: string;
    }

    interface JSXHTMLTimeElement extends JSXHTMLElement {
      dateTime?: string;
    }

    interface JSXHTMLTitleElement extends JSXHTMLElement {
      text?: string;
    }

    interface JSXHTMLTableRowElement extends JSXHTMLElement {
      align?: string;
      bgColor?: string;
      ch?: string;
      chOff?: string;
      rowIndex?: number;
      sectionRowIndex?: number;
      vAlign?: string;
    }

    interface JSXHTMLTrackElement extends JSXHTMLElement {
      default?: boolean;
      kind?: string;
      label?: string;
      readyState?: number;
      src?: string;
      srclang?: string;
    }

    interface JSXHTMLUListElement extends JSXHTMLElement {
      compact?: boolean;
      type?: string;
    }

    interface JSXHTMLVideoElement extends JSXHTMLMediaElement {
      'on:enterpictureinpicture'?: QRL;
      'on:leavepictureinpicture'?: QRL;
      disablePictureInPicture?: boolean;
      height?: number;
      playsInline?: boolean;
      poster?: string;
      videoHeight?: number;
      videoWidth?: number;
      webkitDecodedFrameCount?: number;
      webkitDisplayingFullscreen?: boolean;
      webkitDroppedFrameCount?: number;
      webkitSupportsFullscreen?: boolean;
      width?: number;
    }

    interface JSXHTMLMediaElement extends JSXHTMLElement {
      'on:encrypted'?: QRL;
      'on:waitingforkey'?: QRL;
      autoplay?: boolean;
      controls?: boolean;
      crossOrigin?: string;
      currentSrc?: string;
      currentTime?: number;
      defaultMuted?: boolean;
      defaultPlaybackRate?: number;
      disableRemotePlayback?: boolean;
      duration?: number;
      ended?: boolean;
      error?: string;
      loop?: boolean;
      mediaKeys?: string;
      muted?: boolean;
      networkState?: number;
      paused?: boolean;
      playbackRate?: number;
      preload?: string;
      preservesPitch?: boolean;
      readyState?: number;
      seeking?: boolean;
      sinkId?: string;
      src?: string;
      srcObject?: string;
      volume?: number;
      webkitAudioDecodedByteCount?: number;
      webkitVideoDecodedByteCount?: number;
    }
  }
}

/**
 * @internal
 */
// So that this file is treated as module.
export type JSX_IntrinsicElements = JSX.IntrinsicElements;
