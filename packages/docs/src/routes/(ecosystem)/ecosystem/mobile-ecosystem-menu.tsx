import { $ } from '@builder.io/qwik';

export const MobileEcosystemMenu = () => {
  const scrollIntoView = $((_: any, elm: HTMLAnchorElement) => {
    const id = elm.getAttribute('href')?.replace('#', '');
    const target = document.getElementById(id!);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
      history.pushState(null, '', `#${id}`);
    }
  });

  return (
    <nav class="moblie-ecosystem-menu px-6 lg:hidden">
      <details>
        <summary class="font-bold border border-transparent px-6 py-1 rounded-[5px] transi">
          Menu
        </summary>
        <ul class="flex flex-col gap-4 mt-2 p-4 border border-transparent">
          <li>
            <a
              class="flex items-center gap-4"
              href="#deployments"
              onClick$={scrollIntoView}
              preventdefault:click
            >
              <svg
                width="22"
                height="19"
                viewBox="0 0 22 19"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <g clip-path="url(#clip0_1800_3901)">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M1.92302 4.04938C1.90718 3.78325 2.10142 3.55371 2.35696 3.53721C2.37625 3.53577 2.39553 3.53577 2.41482 3.53721H4.52941C4.78495 3.55371 4.97919 3.78325 4.96335 4.04938C4.94888 4.29256 4.76291 4.48624 4.52941 4.5013H2.41482C2.15928 4.5178 1.93887 4.31552 1.92302 4.04938Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M1.92302 6.52204C1.90718 6.25519 2.10142 6.02636 2.35696 6.00987C2.37625 6.00843 2.39553 6.00843 2.41482 6.00987H6.05991C6.31545 6.02636 6.50969 6.25519 6.49384 6.52204C6.47938 6.7645 6.29341 6.9589 6.05991 6.97396H2.41482C2.15928 6.99046 1.93887 6.78817 1.92302 6.52204Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M2.44168 8.47681H7.59108C7.84663 8.49331 8.04086 8.72213 8.02502 8.98827C8.01056 9.23144 7.82458 9.42512 7.59108 9.4409H2.44168C2.18614 9.42369 1.9919 9.19486 2.00774 8.92873C2.0222 8.68555 2.20818 8.49187 2.44168 8.47681Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M9.96949 11.4049C9.98533 11.671 9.79109 11.8999 9.53555 11.9164C9.51626 11.9178 9.49698 11.9178 9.47769 11.9164H2.41482C2.15928 11.9336 1.93887 11.7306 1.92302 11.4644C1.90718 11.1983 2.10142 10.9695 2.35696 10.953C2.37625 10.9515 2.39553 10.9515 2.41482 10.953H9.47769C9.73323 10.9358 9.95364 11.1388 9.96949 11.4049Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M9.53555 11.9164C9.51626 11.9178 9.49698 11.9178 9.47769 11.9164H2.41482C2.15928 11.9336 1.93887 11.7306 1.92302 11.4644C1.90718 11.1983 2.10142 10.9695 2.35696 10.953C2.37625 10.9515 2.39553 10.9515 2.41482 10.953H9.47769C9.73323 10.9358 9.95364 11.1388 9.96949 11.4049C9.98533 11.671 9.79109 11.8999 9.53555 11.9164Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M8.02502 8.98827C8.01056 9.23144 7.82458 9.42512 7.59108 9.4409H2.44168C2.18614 9.42369 1.9919 9.19486 2.00774 8.92873C2.0222 8.68555 2.20818 8.49187 2.44168 8.47681H7.59108C7.84663 8.49331 8.04086 8.72213 8.02502 8.98827Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M6.49384 6.52204C6.47938 6.7645 6.29341 6.9589 6.05991 6.97396H2.41482C2.15928 6.99046 1.93887 6.78817 1.92302 6.52204C1.90718 6.25519 2.10142 6.02636 2.35696 6.00987C2.37625 6.00843 2.39553 6.00843 2.41482 6.00987H6.05991C6.31545 6.02636 6.50969 6.25519 6.49384 6.52204Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M4.96335 4.04938C4.94888 4.29256 4.76291 4.48624 4.52941 4.5013H2.41482C2.15928 4.5178 1.93887 4.31552 1.92302 4.04938C1.90718 3.78325 2.10142 3.55371 2.35696 3.53721C2.37625 3.53577 2.39553 3.53577 2.41482 3.53721H4.52941C4.78495 3.55371 4.97919 3.78325 4.96335 4.04938Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M1.92302 4.04938C1.90718 3.78325 2.10142 3.55371 2.35696 3.53721C2.37625 3.53577 2.39553 3.53577 2.41482 3.53721H4.52941C4.78495 3.55371 4.97919 3.78325 4.96335 4.04938C4.94888 4.29256 4.76291 4.48624 4.52941 4.5013H2.41482C2.15928 4.5178 1.93887 4.31552 1.92302 4.04938Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M1.92302 6.52204C1.90718 6.25519 2.10142 6.02636 2.35696 6.00987C2.37625 6.00843 2.39553 6.00843 2.41482 6.00987H6.05991C6.31545 6.02636 6.50969 6.25519 6.49384 6.52204C6.47938 6.7645 6.29341 6.9589 6.05991 6.97396H2.41482C2.15928 6.99046 1.93887 6.78817 1.92302 6.52204Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M2.44168 8.47681H7.59108C7.84663 8.49331 8.04086 8.72213 8.02502 8.98827C8.01056 9.23144 7.82458 9.42512 7.59108 9.4409H2.44168C2.18614 9.42369 1.9919 9.19486 2.00774 8.92873C2.0222 8.68555 2.20818 8.49187 2.44168 8.47681Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M9.96949 11.4049C9.98533 11.671 9.79109 11.8999 9.53555 11.9164C9.51626 11.9178 9.49698 11.9178 9.47769 11.9164H2.41482C2.15928 11.9336 1.93887 11.7306 1.92302 11.4644C1.90718 11.1983 2.10142 10.9695 2.35696 10.953C2.37625 10.9515 2.39553 10.9515 2.41482 10.953H9.47769C9.73323 10.9358 9.95364 11.1388 9.96949 11.4049Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M11.637 9.38488L14.0078 7.98608V9.38488H13.9933L12.4663 9.98099L13.9933 10.5857V11.9838L11.637 10.5857V9.38488Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M15.9345 7.31323H16.9422L15.6886 12.3676H14.6809L15.9345 7.31323Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M19.7814 9.38488V10.5857L17.4133 11.9838V10.5857L18.9383 9.98099L17.4133 9.38488V7.98608L19.7814 9.38488Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M21.4021 0H0.597876C0.269323 0.00143467 0.00276045 0.276891 5.2883e-06 0.619058V14.9765C-0.00137229 15.3215 0.266568 15.602 0.597876 15.6027H21.4021C21.7321 15.602 21.9993 15.3237 22 14.9801V0.622645C21.9993 0.279043 21.7321 0.00143467 21.4021 0ZM20.4461 0.917469C20.6438 0.917469 20.8043 1.08461 20.8043 1.29048C20.8043 1.49636 20.6438 1.6635 20.4461 1.6635C20.2484 1.6635 20.0879 1.49636 20.0879 1.29048C20.0879 1.08461 20.2484 0.917469 20.4461 0.917469ZM19.2428 0.917469C19.4405 0.917469 19.6009 1.08461 19.6009 1.29048C19.6009 1.49636 19.4405 1.6635 19.2428 1.6635C19.0451 1.6635 18.8846 1.49636 18.8846 1.29048C18.8846 1.08461 19.0451 0.917469 19.2428 0.917469ZM18.0395 0.917469C18.2371 0.917469 18.3976 1.08461 18.3976 1.29048C18.3976 1.49636 18.2371 1.6635 18.0395 1.6635C17.8418 1.6635 17.6813 1.49636 17.6813 1.29048C17.6813 1.08461 17.8418 0.917469 18.0395 0.917469ZM10.316 2.17208H12.9638C12.9761 2.25099 12.9823 2.33133 12.9817 2.41096C12.9334 3.10462 12.4031 3.65625 11.737 3.70718C10.9959 3.76385 10.3505 3.18352 10.2961 2.41096C10.2967 2.33133 10.3029 2.25099 10.316 2.17208ZM21.4572 13.209C21.4572 13.5174 21.2169 13.7685 20.9207 13.7685H1.09036C0.793493 13.7685 0.553105 13.5174 0.553105 13.209V2.17998H8.26619V2.68354C8.26619 2.87148 8.4129 3.02428 8.59337 3.02428H9.10032C9.15198 3.25884 9.23326 3.48552 9.34208 3.69785L8.95154 4.10243C8.82894 4.23513 8.82894 4.4446 8.95154 4.5773L9.43714 5.08302C9.43714 5.08302 9.43852 5.08517 9.43989 5.08589C9.56801 5.21788 9.77396 5.21645 9.90069 5.08302L10.2589 4.71001C10.4538 4.83769 10.6646 4.9374 10.885 5.00627V5.58085C10.8864 5.76879 11.0324 5.92087 11.2128 5.9223H11.9058C12.0862 5.92087 12.2323 5.76879 12.2336 5.58085V5.05505C12.4582 5.00125 12.6751 4.9166 12.8777 4.80326L13.2682 5.20999C13.3963 5.34198 13.6023 5.34198 13.7304 5.20999L14.2153 4.70427C14.3427 4.57156 14.3427 4.35636 14.2153 4.22366L13.8571 3.85064C13.9804 3.64692 14.0768 3.42742 14.1437 3.19787H14.6809C14.8621 3.19787 15.0088 3.04508 15.0088 2.85642V2.17208H21.4572V13.209Z"
                    fill="currentColor"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M8.28764 16.4585H13.7126C13.727 17.4355 14.1134 18.3121 15.1611 19H6.83911C7.68219 18.3644 8.29108 17.594 8.28764 16.4585Z"
                    fill="currentColor"
                  />
                </g>
                <defs>
                  <clipPath id="clip0_1800_3901">
                    <rect width="22" height="19" fill="white" />
                  </clipPath>
                </defs>
              </svg>

              <span>Deployments</span>
            </a>
          </li>

          <li>
            <a
              class="flex items-center gap-4"
              href="#integrations"
              onClick$={scrollIntoView}
              preventdefault:click
            >
              <svg
                width="20"
                height="19"
                viewBox="0 0 20 19"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <g clip-path="url(#clip0_1800_3922)">
                  <path
                    d="M18.3871 14.5763H16.9742C16.7959 14.5763 16.6516 14.4346 16.6516 14.2594C16.6516 14.0842 16.7959 13.9425 16.9742 13.9425H18.3871C18.9207 13.9425 19.3548 13.5161 19.3548 12.9919V1.58438C19.3548 1.06017 18.9207 0.633751 18.3871 0.633751H1.6129C1.07926 0.633751 0.645161 1.06017 0.645161 1.58438V12.9919C0.645161 13.5161 1.07926 13.9425 1.6129 13.9425H3.02581C3.20415 13.9425 3.34839 14.0842 3.34839 14.2594C3.34839 14.4346 3.20415 14.5763 3.02581 14.5763H1.6129C0.723502 14.5763 0 13.8656 0 12.9919V1.58438C0 0.710706 0.723502 0 1.6129 0H18.3871C19.2765 0 20 0.710706 20 1.58438V12.9919C20 13.8656 19.2765 14.5763 18.3871 14.5763Z"
                    fill="currentColor"
                  />
                  <path
                    d="M18.3871 3.16866H1.61286C1.43452 3.16866 1.29028 3.02697 1.29028 2.85179C1.29028 2.6766 1.43452 2.53491 1.61286 2.53491H18.3871C18.5654 2.53491 18.7096 2.6766 18.7096 2.85179C18.7096 3.02697 18.5654 3.16866 18.3871 3.16866Z"
                    fill="currentColor"
                  />
                  <path
                    d="M2.25813 1.9012C2.23693 1.9012 2.21573 1.89893 2.19499 1.89486C2.17472 1.89079 2.15444 1.8849 2.13463 1.87675C2.11527 1.86906 2.09638 1.8591 2.07886 1.84778C2.06135 1.83646 2.04476 1.82288 2.03002 1.8084C1.97011 1.74955 1.93555 1.66762 1.93555 1.58432C1.93555 1.5635 1.93785 1.54268 1.942 1.52231C1.94615 1.50239 1.95214 1.48247 1.96043 1.463C1.96827 1.44399 1.9784 1.42543 1.98992 1.40823C2.00145 1.39103 2.01527 1.37473 2.03002 1.36025C2.04476 1.34576 2.06135 1.33218 2.07886 1.32086C2.09638 1.30955 2.11527 1.29959 2.13463 1.29189C2.15444 1.28374 2.17472 1.27786 2.19499 1.27378C2.23647 1.26518 2.27933 1.26518 2.32126 1.27378C2.34154 1.27786 2.36181 1.28374 2.38163 1.29189C2.40098 1.29959 2.41988 1.30955 2.43739 1.32086C2.4549 1.33218 2.47149 1.34576 2.48624 1.36025C2.50098 1.37473 2.51481 1.39103 2.52633 1.40823C2.53785 1.42543 2.54799 1.44399 2.55582 1.463C2.56412 1.48247 2.57011 1.50239 2.57426 1.52231C2.5784 1.54268 2.58071 1.5635 2.58071 1.58432C2.58071 1.66762 2.54615 1.74955 2.48624 1.8084C2.47149 1.82288 2.4549 1.83646 2.43739 1.84778C2.41988 1.8591 2.40098 1.86906 2.38163 1.87675C2.36181 1.8849 2.34154 1.89079 2.32126 1.89486C2.30052 1.89893 2.27933 1.9012 2.25813 1.9012Z"
                    fill="currentColor"
                  />
                  <path
                    d="M3.54841 1.90135C3.52721 1.90135 3.50601 1.89954 3.48528 1.89501C3.465 1.89094 3.44426 1.88505 3.42491 1.8769C3.40555 1.86921 3.38666 1.85925 3.36915 1.84793C3.35164 1.83661 3.33505 1.82303 3.3203 1.80855C3.30555 1.79406 3.29173 1.77777 3.28021 1.76056C3.26869 1.74336 3.25855 1.7248 3.25071 1.70579C3.24242 1.68632 3.23643 1.66641 3.23228 1.64649C3.22767 1.62612 3.22583 1.60529 3.22583 1.58447C3.22583 1.56365 3.22767 1.54282 3.23228 1.52245C3.23643 1.50254 3.24242 1.48262 3.25071 1.46315C3.25855 1.44414 3.26869 1.42558 3.28021 1.40838C3.29173 1.39118 3.30555 1.37488 3.3203 1.3604C3.33505 1.34591 3.35164 1.33233 3.36915 1.32101C3.38666 1.3097 3.40555 1.29974 3.42491 1.29204C3.44426 1.28389 3.465 1.27801 3.48528 1.27393C3.52675 1.26579 3.57007 1.26579 3.61154 1.27393C3.63182 1.27801 3.6521 1.28389 3.67191 1.29204C3.69127 1.29974 3.71016 1.3097 3.72767 1.32101C3.74518 1.33233 3.76177 1.34591 3.77652 1.3604C3.79127 1.37488 3.80463 1.39118 3.81661 1.40838C3.82813 1.42558 3.83827 1.44414 3.84611 1.46315C3.8544 1.48217 3.86039 1.50254 3.86454 1.52245C3.86869 1.54282 3.87099 1.56365 3.87099 1.58447C3.87099 1.60529 3.86869 1.62612 3.86454 1.64649C3.86039 1.66641 3.8544 1.68632 3.84611 1.70579C3.83827 1.7248 3.82813 1.74336 3.81661 1.76056C3.80463 1.77777 3.79127 1.79406 3.77652 1.80855C3.76177 1.82303 3.74518 1.83661 3.72767 1.84793C3.71016 1.85925 3.69127 1.86921 3.67191 1.8769C3.6521 1.88505 3.63182 1.89094 3.61154 1.89501C3.59081 1.89954 3.56961 1.90135 3.54841 1.90135Z"
                    fill="currentColor"
                  />
                  <path
                    d="M4.83869 1.90135C4.8175 1.90135 4.7963 1.89908 4.77556 1.89501C4.75528 1.89094 4.73455 1.88505 4.71519 1.8769C4.69584 1.86921 4.67694 1.85925 4.65943 1.84793C4.64192 1.83616 4.62533 1.82303 4.61058 1.80855C4.59584 1.79406 4.58247 1.77777 4.57049 1.76056C4.55897 1.74336 4.54883 1.7248 4.541 1.70579C4.5327 1.68632 4.52671 1.66641 4.52256 1.64649C4.51842 1.62612 4.51611 1.60529 4.51611 1.58447C4.51611 1.50118 4.55068 1.41924 4.61058 1.3604C4.62533 1.34591 4.64192 1.33278 4.65943 1.32101C4.67694 1.3097 4.69584 1.29974 4.71519 1.29204C4.73455 1.28389 4.75482 1.27801 4.77556 1.27393C4.81703 1.26579 4.86035 1.26579 4.90183 1.27393C4.9221 1.27801 4.94238 1.28389 4.9622 1.29204C4.98155 1.29974 5.00044 1.3097 5.0175 1.32101C5.03547 1.33278 5.05206 1.34591 5.0668 1.3604C5.08155 1.37488 5.09492 1.39118 5.1069 1.40838C5.11842 1.42558 5.12856 1.44414 5.13639 1.46315C5.14468 1.48262 5.15068 1.50254 5.15482 1.52245C5.15897 1.54282 5.16127 1.56365 5.16127 1.58447C5.16127 1.60529 5.15897 1.62612 5.15482 1.64649C5.15068 1.66641 5.14468 1.68632 5.13639 1.70579C5.12856 1.7248 5.11842 1.74336 5.1069 1.76056C5.09492 1.77777 5.08155 1.79406 5.0668 1.80855C5.05206 1.82303 5.03547 1.83616 5.0175 1.84793C5.00044 1.85925 4.98155 1.86921 4.9622 1.8769C4.94238 1.88505 4.9221 1.89094 4.90183 1.89501C4.88109 1.89908 4.85989 1.90135 4.83869 1.90135Z"
                    fill="currentColor"
                  />
                  <path
                    d="M15.1844 11.7696H15.0572C14.7941 11.7696 14.5636 11.6053 14.4724 11.3631C14.4309 11.2531 14.3848 11.1449 14.3355 11.0385C14.2254 10.8031 14.2696 10.5266 14.4558 10.3432L14.5457 10.2549C14.7885 10.0164 14.7885 9.62934 14.5457 9.39078L13.666 8.52662C13.4231 8.28805 13.0291 8.28805 12.7862 8.52662L12.6964 8.61489C12.5097 8.79822 12.2282 8.84168 11.9885 8.73304C11.8807 8.68415 11.7706 8.63933 11.6581 8.59859C11.4116 8.50851 11.2443 8.28262 11.2443 8.02414V7.8992C11.2443 7.5615 10.966 7.28809 10.6222 7.28809H9.37793C9.03416 7.28809 8.75582 7.5615 8.75582 7.8992V8.02414C8.75582 8.28262 8.58853 8.50896 8.34199 8.59859C8.23001 8.63933 8.11987 8.6846 8.01158 8.73304C7.77194 8.84123 7.49038 8.79777 7.30374 8.61489L7.21388 8.52662C6.97102 8.28805 6.57701 8.28805 6.33416 8.52662L5.45443 9.39078C5.21158 9.62934 5.21158 10.0164 5.45443 10.2549L5.54429 10.3432C5.73093 10.5266 5.77517 10.8031 5.66457 11.0385C5.6148 11.1445 5.56918 11.2527 5.5277 11.3631C5.436 11.6053 5.20605 11.7696 4.94291 11.7696H4.81572C4.47194 11.7696 4.1936 12.043 4.1936 12.3807V13.603C4.1936 13.9407 4.47194 14.2141 4.81572 14.2141H4.94291C5.20605 14.2141 5.43646 14.3784 5.5277 14.6206C5.56918 14.7306 5.61526 14.8388 5.66457 14.9452C5.77471 15.1805 5.73047 15.4571 5.54429 15.6405L5.45443 15.7287C5.21158 15.9673 5.21158 16.3543 5.45443 16.5929L6.33416 17.4571C6.57701 17.6956 6.97102 17.6956 7.21388 17.4571L7.30374 17.3688C7.49038 17.1855 7.77194 17.142 8.01158 17.2506C8.11941 17.2995 8.22955 17.3444 8.34199 17.3851C8.58853 17.4752 8.75582 17.7011 8.75582 17.9595V18.0845C8.75582 18.4222 9.03416 18.6956 9.37793 18.6956H10.6222C10.966 18.6956 11.2443 18.4222 11.2443 18.0845V17.9595C11.2443 17.7011 11.4116 17.4747 11.6581 17.3851C11.7701 17.3444 11.8802 17.2991 11.9885 17.2506C12.2282 17.1425 12.5097 17.1859 12.6964 17.3688L12.7862 17.4571C13.0291 17.6956 13.4231 17.6956 13.666 17.4571L14.5457 16.5929C14.7885 16.3543 14.7885 15.9673 14.5457 15.7287L14.4558 15.6405C14.2692 15.4571 14.2249 15.1805 14.3355 14.9452C14.3853 14.8392 14.4309 14.731 14.4724 14.6206C14.5641 14.3784 14.7941 14.2141 15.0572 14.2141H15.1844C15.5282 14.2141 15.8065 13.9407 15.8065 13.603V12.3807C15.8065 12.043 15.5282 11.7696 15.1844 11.7696ZM10.0001 15.8437C9.99637 15.8437 9.99222 15.8437 9.98853 15.8437C9.98485 15.8437 9.9807 15.8437 9.97701 15.8437C8.37379 15.8437 7.07379 14.5667 7.07379 12.9918C7.07379 11.417 8.37379 10.14 9.97701 10.14C9.9807 10.14 9.98485 10.14 9.98853 10.14C9.99222 10.14 9.99637 10.14 10.0001 10.14C11.601 10.14 12.9033 11.4192 12.9033 12.9918C12.9033 14.5645 11.601 15.8437 10.0001 15.8437Z"
                    fill="currentColor"
                  />
                </g>
                <defs>
                  <clipPath id="clip0_1800_3922">
                    <rect width="20" height="18.6957" fill="white" />
                  </clipPath>
                </defs>
              </svg>
              <span>Integrations</span>
            </a>
          </li>

          <li>
            <a
              class="flex items-center gap-4"
              href="#courses"
              onClick$={scrollIntoView}
              preventdefault:click
            >
              <svg
                width="20"
                height="19"
                viewBox="5 5 37 37"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4">
                  <path d="M8 7h32v24H8z"></path>
                  <path
                    strokeLinecap="round"
                    d="M4 7h40M15 41l9-10l9 10M16 13h16m-16 6h12m-12 6h6"
                  ></path>
                </g>
              </svg>{' '}
              <span>Courses</span>
            </a>
          </li>

          <li>
            <a
              class="flex items-center gap-4"
              href="#videos"
              onClick$={scrollIntoView}
              preventdefault:click
            >
              <svg
                width="20"
                height="18"
                viewBox="0 0 20 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M9.88965 17.7793C12.0171 17.7793 13.7793 16.0171 13.7793 13.8896C13.7793 11.7622 12.0131 10 9.88563 10C7.76218 10 6 11.7622 6 13.8896C6 16.0171 7.76218 17.7793 9.88965 17.7793ZM9.1631 15.427C8.97845 15.5394 8.76972 15.4471 8.76972 15.2585V12.5249C8.76972 12.3362 8.99451 12.2559 9.1631 12.3563L11.407 13.6809C11.5675 13.7773 11.5716 14.0101 11.407 14.1064L9.1631 15.427Z"
                  fill="currentColor"
                  fill-opacity="0.7"
                />
                <path
                  d="M18.3871 14.5763H16.9742C16.7959 14.5763 16.6516 14.4346 16.6516 14.2594C16.6516 14.0842 16.7959 13.9425 16.9742 13.9425H18.3871C18.9207 13.9425 19.3548 13.5161 19.3548 12.9919V1.58438C19.3548 1.06017 18.9207 0.633751 18.3871 0.633751H1.6129C1.07926 0.633751 0.645161 1.06017 0.645161 1.58438V12.9919C0.645161 13.5161 1.07926 13.9425 1.6129 13.9425H3.02581C3.20415 13.9425 3.34839 14.0842 3.34839 14.2594C3.34839 14.4346 3.20415 14.5763 3.02581 14.5763H1.6129C0.723502 14.5763 0 13.8656 0 12.9919V1.58438C0 0.710706 0.723502 0 1.6129 0H18.3871C19.2765 0 20 0.710706 20 1.58438V12.9919C20 13.8656 19.2765 14.5763 18.3871 14.5763Z"
                  fill="currentColor"
                />
                <path
                  d="M18.3868 3.16866H1.61262C1.43428 3.16866 1.29004 3.02697 1.29004 2.85179C1.29004 2.6766 1.43428 2.53491 1.61262 2.53491H18.3868C18.5652 2.53491 18.7094 2.6766 18.7094 2.85179C18.7094 3.02697 18.5652 3.16866 18.3868 3.16866Z"
                  fill="currentColor"
                />
                <path
                  d="M2.25813 1.9012C2.23693 1.9012 2.21573 1.89893 2.19499 1.89486C2.17472 1.89079 2.15444 1.8849 2.13463 1.87675C2.11527 1.86906 2.09638 1.8591 2.07886 1.84778C2.06135 1.83646 2.04476 1.82288 2.03002 1.8084C1.97011 1.74955 1.93555 1.66762 1.93555 1.58432C1.93555 1.5635 1.93785 1.54268 1.942 1.52231C1.94615 1.50239 1.95214 1.48247 1.96043 1.463C1.96827 1.44399 1.9784 1.42543 1.98992 1.40823C2.00145 1.39103 2.01527 1.37473 2.03002 1.36025C2.04476 1.34576 2.06135 1.33218 2.07886 1.32086C2.09638 1.30955 2.11527 1.29959 2.13463 1.29189C2.15444 1.28374 2.17472 1.27786 2.19499 1.27378C2.23647 1.26518 2.27933 1.26518 2.32126 1.27378C2.34154 1.27786 2.36181 1.28374 2.38163 1.29189C2.40098 1.29959 2.41988 1.30955 2.43739 1.32086C2.4549 1.33218 2.47149 1.34576 2.48624 1.36025C2.50098 1.37473 2.51481 1.39103 2.52633 1.40823C2.53785 1.42543 2.54799 1.44399 2.55582 1.463C2.56412 1.48247 2.57011 1.50239 2.57426 1.52231C2.5784 1.54268 2.58071 1.5635 2.58071 1.58432C2.58071 1.66762 2.54615 1.74955 2.48624 1.8084C2.47149 1.82288 2.4549 1.83646 2.43739 1.84778C2.41988 1.8591 2.40098 1.86906 2.38163 1.87675C2.36181 1.8849 2.34154 1.89079 2.32126 1.89486C2.30052 1.89893 2.27933 1.9012 2.25813 1.9012Z"
                  fill="currentColor"
                />
                <path
                  d="M3.54817 1.90135C3.52697 1.90135 3.50577 1.89954 3.48503 1.89501C3.46476 1.89094 3.44402 1.88505 3.42466 1.8769C3.40531 1.86921 3.38642 1.85925 3.3689 1.84793C3.35139 1.83661 3.3348 1.82303 3.32006 1.80855C3.30531 1.79406 3.29148 1.77777 3.27996 1.76056C3.26844 1.74336 3.2583 1.7248 3.25047 1.70579C3.24218 1.68632 3.23618 1.66641 3.23204 1.64649C3.22743 1.62612 3.22559 1.60529 3.22559 1.58447C3.22559 1.56365 3.22743 1.54282 3.23204 1.52245C3.23618 1.50254 3.24218 1.48262 3.25047 1.46315C3.2583 1.44414 3.26844 1.42558 3.27996 1.40838C3.29148 1.39118 3.30531 1.37488 3.32006 1.3604C3.3348 1.34591 3.35139 1.33233 3.3689 1.32101C3.38642 1.3097 3.40531 1.29974 3.42466 1.29204C3.44402 1.28389 3.46476 1.27801 3.48503 1.27393C3.52651 1.26579 3.56983 1.26579 3.6113 1.27393C3.63158 1.27801 3.65185 1.28389 3.67167 1.29204C3.69102 1.29974 3.70992 1.3097 3.72743 1.32101C3.74494 1.33233 3.76153 1.34591 3.77628 1.3604C3.79102 1.37488 3.80439 1.39118 3.81637 1.40838C3.82789 1.42558 3.83803 1.44414 3.84586 1.46315C3.85416 1.48217 3.86015 1.50254 3.8643 1.52245C3.86844 1.54282 3.87075 1.56365 3.87075 1.58447C3.87075 1.60529 3.86844 1.62612 3.8643 1.64649C3.86015 1.66641 3.85416 1.68632 3.84586 1.70579C3.83803 1.7248 3.82789 1.74336 3.81637 1.76056C3.80439 1.77777 3.79102 1.79406 3.77628 1.80855C3.76153 1.82303 3.74494 1.83661 3.72743 1.84793C3.70992 1.85925 3.69102 1.86921 3.67167 1.8769C3.65185 1.88505 3.63158 1.89094 3.6113 1.89501C3.59056 1.89954 3.56936 1.90135 3.54817 1.90135Z"
                  fill="currentColor"
                />
                <path
                  d="M4.83918 1.90135C4.81798 1.90135 4.79679 1.89908 4.77605 1.89501C4.75577 1.89094 4.73503 1.88505 4.71568 1.8769C4.69633 1.86921 4.67743 1.85925 4.65992 1.84793C4.64241 1.83616 4.62582 1.82303 4.61107 1.80855C4.59633 1.79406 4.58296 1.77777 4.57098 1.76056C4.55946 1.74336 4.54932 1.7248 4.54149 1.70579C4.53319 1.68632 4.5272 1.66641 4.52305 1.64649C4.51891 1.62612 4.5166 1.60529 4.5166 1.58447C4.5166 1.50118 4.55116 1.41924 4.61107 1.3604C4.62582 1.34591 4.64241 1.33278 4.65992 1.32101C4.67743 1.3097 4.69633 1.29974 4.71568 1.29204C4.73503 1.28389 4.75531 1.27801 4.77605 1.27393C4.81752 1.26579 4.86084 1.26579 4.90232 1.27393C4.92259 1.27801 4.94287 1.28389 4.96268 1.29204C4.98204 1.29974 5.00093 1.3097 5.01798 1.32101C5.03596 1.33278 5.05255 1.34591 5.06729 1.3604C5.08204 1.37488 5.0954 1.39118 5.10738 1.40838C5.11891 1.42558 5.12904 1.44414 5.13688 1.46315C5.14517 1.48262 5.15116 1.50254 5.15531 1.52245C5.15946 1.54282 5.16176 1.56365 5.16176 1.58447C5.16176 1.60529 5.15946 1.62612 5.15531 1.64649C5.15116 1.66641 5.14517 1.68632 5.13688 1.70579C5.12904 1.7248 5.11891 1.74336 5.10738 1.76056C5.0954 1.77777 5.08204 1.79406 5.06729 1.80855C5.05255 1.82303 5.03596 1.83616 5.01798 1.84793C5.00093 1.85925 4.98204 1.86921 4.96268 1.8769C4.94287 1.88505 4.92259 1.89094 4.90232 1.89501C4.88158 1.89908 4.86038 1.90135 4.83918 1.90135Z"
                  fill="currentColor"
                />
              </svg>
              <span>Videos</span>
            </a>
          </li>

          <li>
            <a
              class="flex items-center gap-4"
              href="#showcase"
              onClick$={scrollIntoView}
              preventdefault:click
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M6.7793 13.9551C10.4023 13.9551 13.4033 10.9541 13.4033 7.33105C13.4033 3.70801 10.3955 0.707031 6.77246 0.707031C3.15625 0.707031 0.155273 3.70801 0.155273 7.33105C0.155273 10.9541 3.15625 13.9551 6.7793 13.9551ZM5.00195 6.05957C4.98145 5.81348 4.86523 5.58789 4.69434 5.42383C5.26172 4.00195 6.15723 2.70996 7.31934 1.66406C7.40137 1.6709 7.49023 1.68457 7.57227 1.69824C6.74512 3.11328 6.24609 4.69922 6.11621 6.34668C5.74023 6.27832 5.36426 6.18262 5.00195 6.05957ZM2.03516 4.21387C2.94434 2.83984 4.44141 1.86914 6.14355 1.6709C5.18652 2.68262 4.44141 3.8584 3.93555 5.13672C3.7373 5.14355 3.55957 5.20508 3.40918 5.30762C2.91016 5 2.45215 4.63086 2.03516 4.21387ZM8.7959 4.27539C8.78906 3.55078 8.88477 2.82617 9.09668 2.14258C10.3408 2.70996 11.3594 3.71484 11.9404 4.95215C11.2773 5.45801 10.5322 5.84082 9.74609 6.09375C9.56152 5.86133 9.27441 5.7041 8.95996 5.69727C8.85742 5.23926 8.80273 4.76074 8.7959 4.27539ZM7.98242 4.28223C7.98926 4.87695 8.06445 5.45801 8.19434 6.02539C8.08496 6.1416 8.00293 6.27832 7.96191 6.43555C7.79785 6.44922 7.63379 6.45605 7.46973 6.45605C7.28516 6.45605 7.10742 6.44922 6.92969 6.44238C7.03906 4.91797 7.49023 3.46191 8.24219 2.16309C8.06445 2.84668 7.97559 3.55078 7.98242 4.28223ZM1.0918 7.33105C1.0918 6.49023 1.27637 5.69043 1.61133 4.96582C2.02832 5.35547 2.47949 5.7041 2.96484 6.00488C2.95801 6.05273 2.95117 6.10742 2.95117 6.16211C2.95117 6.51074 3.12207 6.81836 3.38867 7.00293C3.25879 7.66602 3.18359 8.34277 3.18359 9.0332C2.44531 8.6709 1.74805 8.21973 1.09863 7.67285C1.0918 7.56348 1.0918 7.44727 1.0918 7.33105ZM12.4736 7.33105C12.4736 7.87109 12.3916 8.4043 12.248 8.90332C11.8721 9.10156 11.4893 9.27246 11.0996 9.42285C10.4912 8.8623 9.98535 8.20605 9.60254 7.48145C9.77344 7.33105 9.89648 7.12598 9.9375 6.89355C10.7578 6.63379 11.5371 6.25098 12.248 5.75195C12.3916 6.25098 12.4736 6.78418 12.4736 7.33105ZM6.08887 7.17383C6.08887 8.00781 6.18457 8.82812 6.3623 9.62109C6.25977 9.70996 6.16406 9.81934 6.10254 9.94238C5.38477 9.83301 4.68066 9.64844 3.99707 9.38867C3.97656 8.63672 4.03809 7.8916 4.18164 7.17383C4.40723 7.13281 4.6123 7.00977 4.75586 6.83887C5.18652 6.98242 5.63086 7.0918 6.08887 7.16016V7.17383ZM7.46973 7.26953C7.6748 7.26953 7.87305 7.2627 8.07129 7.24902C8.23535 7.50195 8.50195 7.68652 8.81641 7.7207C9.17871 8.45215 9.65723 9.12207 10.2314 9.70312C9.48633 9.9082 8.72754 10.0244 7.96875 10.0518C7.83203 9.70996 7.52441 9.45703 7.15527 9.40918C6.99121 8.70508 6.90918 7.9873 6.90234 7.25586C7.08691 7.2627 7.27832 7.26953 7.46973 7.26953ZM1.30371 8.86914C1.90527 9.29297 2.54102 9.65527 3.2041 9.94238C3.23828 10.626 3.34082 11.3096 3.51855 11.9727C2.46582 11.2275 1.66602 10.1338 1.30371 8.86914ZM6.7793 13.0254C6 13.0254 5.24805 12.8613 4.56445 12.5605C4.28418 11.8223 4.11328 11.0566 4.04492 10.2705C4.69434 10.4961 5.35742 10.6602 6.03418 10.7559C6.1709 11.1455 6.5332 11.4326 6.96387 11.4531C7.18945 11.9658 7.44922 12.4648 7.75 12.9365C7.43555 12.9912 7.10742 13.0254 6.7793 13.0254ZM7.72949 11.1592C7.81836 11.0771 7.88672 10.9746 7.94141 10.8652C8.95312 10.8311 9.95801 10.6602 10.9355 10.3457C11.0791 10.4551 11.2227 10.5645 11.373 10.667C10.6826 11.6104 9.70508 12.3418 8.57715 12.7246C8.24902 12.2256 7.96191 11.7061 7.72949 11.1592Z"
                  fill="currentColor"
                />
              </svg>
              <span>Showcase</span>
            </a>
          </li>

          <li>
            <a
              class="flex items-center gap-4"
              href="#presentations"
              onClick$={scrollIntoView}
              preventdefault:click
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M6.7793 13.9551C10.4023 13.9551 13.4033 10.9541 13.4033 7.33105C13.4033 3.70801 10.3955 0.707031 6.77246 0.707031C3.15625 0.707031 0.155273 3.70801 0.155273 7.33105C0.155273 10.9541 3.15625 13.9551 6.7793 13.9551ZM5.54199 9.94922C5.22754 10.1406 4.87207 9.9834 4.87207 9.66211V5.00684C4.87207 4.68555 5.25488 4.54883 5.54199 4.71973L9.36328 6.97559C9.63672 7.13965 9.64355 7.53613 9.36328 7.7002L5.54199 9.94922Z"
                  fill="currentColor"
                />
              </svg>
              <span>Presentations</span>
            </a>
          </li>

          <li>
            <a
              class="flex items-center gap-4"
              href="#community"
              onClick$={scrollIntoView}
              preventdefault:click
            >
              <svg width="18" viewBox="0 0 13 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M3.18359 1.63867H9.49316C9.45898 1.07812 9.1377 0.78418 8.5293 0.78418H4.1543C3.5459 0.78418 3.22461 1.07812 3.18359 1.63867ZM2.0625 3.45703H10.6143C10.5186 2.8623 10.2314 2.52734 9.56836 2.52734H3.11523C2.45215 2.52734 2.1582 2.8623 2.0625 3.45703ZM2.71191 15.8916H10.1699C11.3594 15.8916 12.0498 15.208 12.0498 13.8613V6.5332C12.0498 5.17969 11.3525 4.49609 9.98535 4.49609H2.71191C1.34473 4.49609 0.647461 5.17969 0.647461 6.5332V13.8613C0.647461 15.208 1.34473 15.8916 2.71191 15.8916ZM4.27734 11.9199C3.01953 11.9199 2.09668 12.6514 1.76855 13.4717V6.60156C1.76855 5.94531 2.11719 5.61035 2.74609 5.61035H9.95117C10.5732 5.61035 10.9287 5.94531 10.9287 6.60156V13.0889C10.4434 12.4463 9.56152 11.9336 8.39941 11.9336C6.54688 11.9336 5.38477 13.2598 5.38477 14.2988C5.38477 14.5107 5.43262 14.668 5.50098 14.7773H4.69434C4.65332 14.627 4.63281 14.4629 4.63281 14.2988C4.63281 13.5264 5.00195 12.8018 5.61035 12.2412C5.25488 12.0293 4.81738 11.9199 4.27734 11.9199ZM8.39941 11.1611C9.17188 11.1611 9.82812 10.4775 9.82812 9.58203C9.82812 8.7002 9.17188 8.04395 8.39941 8.04395C7.63379 8.04395 6.96387 8.7207 6.9707 9.5957C6.9707 10.4775 7.63379 11.1611 8.39941 11.1611ZM4.28418 11.25C4.9541 11.25 5.52832 10.6484 5.52832 9.8623C5.52832 9.09668 4.9541 8.5293 4.28418 8.5293C3.61426 8.5293 3.0332 9.11035 3.0332 9.86914C3.0332 10.6484 3.61426 11.25 4.28418 11.25Z"
                  fill="currentColor"
                />
              </svg>
              <span>Community</span>
            </a>
          </li>
          <li>
            <a class="flex items-center gap-4" href="/media/#blogs">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                xmlns:xlink="http://www.w3.org/1999/xlink"
                version="1.1"
                id="_x32_"
                width="20px"
                height="20px"
                viewBox="0 0 512 512"
                xml:space="preserve"
                fill="#fff"
              >
                <g id="SVGRepo_bgCarrier" stroke-width="0" />

                <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round" />

                <g id="SVGRepo_iconCarrier">
                  <g>
                    <path
                      class="st0"
                      d="M421.073,221.719c-0.578,11.719-9.469,26.188-23.797,40.094v183.25c-0.016,4.719-1.875,8.719-5.016,11.844 c-3.156,3.063-7.25,4.875-12.063,4.906H81.558c-4.781-0.031-8.891-1.844-12.047-4.906c-3.141-3.125-4.984-7.125-5-11.844V152.219 c0.016-4.703,1.859-8.719,5-11.844c3.156-3.063,7.266-4.875,12.047-4.906h158.609c12.828-16.844,27.781-34.094,44.719-49.906 c0.078-0.094,0.141-0.188,0.219-0.281H81.558c-18.75-0.016-35.984,7.531-48.25,19.594c-12.328,12.063-20.016,28.938-20,47.344 v292.844c-0.016,18.406,7.672,35.313,20,47.344C45.573,504.469,62.808,512,81.558,512h298.641c18.781,0,36.016-7.531,48.281-19.594 c12.297-12.031,20-28.938,19.984-47.344V203.469c0,0-0.125-0.156-0.328-0.313C440.37,209.813,431.323,216.156,421.073,221.719z"
                    />
                    <path
                      class="st0"
                      d="M498.058,0c0,0-15.688,23.438-118.156,58.109C275.417,93.469,211.104,237.313,211.104,237.313 c-15.484,29.469-76.688,151.906-76.688,151.906c-16.859,31.625,14.031,50.313,32.156,17.656 c34.734-62.688,57.156-119.969,109.969-121.594c77.047-2.375,129.734-69.656,113.156-66.531c-21.813,9.5-69.906,0.719-41.578-3.656 c68-5.453,109.906-56.563,96.25-60.031c-24.109,9.281-46.594,0.469-51-2.188C513.386,138.281,498.058,0,498.058,0z"
                    />
                  </g>
                </g>
              </svg>
              <span>Blogs</span>
            </a>
          </li>
        </ul>
      </details>
    </nav>
  );
};
