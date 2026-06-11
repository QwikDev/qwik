import { routeLoader$, validator$, type RequestEventLoader } from '@qwik.dev/router';
import { component$ } from '@qwik.dev/core';

const dataValidator = validator$((ev) => {
  if (ev.query.get('secret') === '123') {
    return {
      success: true,
    };
  }
  return {
    success: false,
    error: {
      validationFailReason: 'Secret not found',
    },
  };
});

const petLoaderQrl = () => {
  return {
    pet: 'guinea pig',
  };
};

const dynamicPetLoaderQrl = () => {
  if (Math.random() > 0.5) {
    return {
      dog: 'malamute',
    };
  }

  return {
    rat: 'guinea pig',
  };
};

const randomFailedLoaderQrl = (ev: RequestEventLoader) => {
  if (Math.random() > 0.5) {
    // An expected failure: returned (not thrown), so it surfaces as `loader.error`
    // while the page still renders.
    return ev.fail(500, {
      loaderFailedReason: 'Reach Limit',
    });
  }

  return {
    pet: 'guinea pig',
  };
};

export const usePetLoader = routeLoader$(petLoaderQrl);
export const usePetWithValidationLoader = routeLoader$(petLoaderQrl, dataValidator);

export const useDynamicPetLoader = routeLoader$(dynamicPetLoaderQrl);
export const useDynamicPetWithValidationLoader = routeLoader$(dynamicPetLoaderQrl, dataValidator);

export const useRandomFailedLoader = routeLoader$(randomFailedLoaderQrl);
export const useRandomFailedWithValidatorLoader = routeLoader$(
  randomFailedLoaderQrl,
  dataValidator
);

export default component$(() => {
  const pet = usePetLoader();
  const petWithValidation = usePetWithValidationLoader();
  const dynamicPet = useDynamicPetLoader();
  const dynamicPetWithValidation = useDynamicPetWithValidationLoader();
  const randomFailed = useRandomFailedLoader();
  const randomFailedWithValidator = useRandomFailedWithValidatorLoader();

  // Returned fail() results and validation failures surface as `loader.error` (a
  // ServerError carrying the payload); `.value` is the success type only. Guard on
  // `.error` before reading `.value`.
  return (
    <div>
      <div>{pet.value.pet}</div>
      <div>
        {petWithValidation.error ? petWithValidation.error.message : petWithValidation.value.pet}
      </div>
      <div>
        {dynamicPet.value.dog}
        {dynamicPet.value.rat}
      </div>
      <div>
        {dynamicPetWithValidation.error
          ? dynamicPetWithValidation.error.message
          : `${dynamicPetWithValidation.value.dog ?? ''}${dynamicPetWithValidation.value.rat ?? ''}`}
      </div>
      <div>{randomFailed.error ? randomFailed.error.message : randomFailed.value.pet}</div>
      <div>
        {randomFailedWithValidator.error
          ? randomFailedWithValidator.error.message
          : randomFailedWithValidator.value.pet}
      </div>
    </div>
  );
});
