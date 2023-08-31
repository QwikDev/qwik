import { component$ } from "@builder.io/qwik";
import {
  routeLoader$,
  validator$,
  type RequestEventAction,
} from "@builder.io/qwik-city";

const dataValidator = validator$((ev) => {
  if (ev.query.get("secret") === "123") {
    return {
      success: true,
    };
  }
  return {
    success: false,
    error: {
      validationFailReason: "Secret not found",
    },
  };
});

const petLoaderQrl = () => {
  return {
    pet: "guinea pig",
  };
};

const dynamicPetLoaderQrl = () => {
  if (Math.random() > 0.5) {
    return {
      dog: "malamute",
    };
  }

  return {
    rat: "guinea pig",
  };
};

const randomFailedLoaderQrl = ({ fail }: RequestEventAction) => {
  if (Math.random() > 0.5) {
    return fail(500, {
      loaderFailedReason: "Reach Limit",
    });
  }

  return {
    pet: "guinea pig",
  };
};

export const usePetLoader = routeLoader$(petLoaderQrl);
export const usePetWithValidationLoader = routeLoader$(
  petLoaderQrl,
  dataValidator,
);

export const useDynamicPetLoader = routeLoader$(dynamicPetLoaderQrl);
export const useDynamicPetWithValidationLoader = routeLoader$(
  dynamicPetLoaderQrl,
  dataValidator,
);

export const useRandomFailedLoader = routeLoader$(randomFailedLoaderQrl);
export const useRandomFailedWithValidatorLoader = routeLoader$(
  randomFailedLoaderQrl,
  dataValidator,
);

export default component$(() => {
  const pet = usePetLoader();
  const petWithValidation = usePetWithValidationLoader();
  const dynamicPet = useDynamicPetLoader();
  const dynamicPetWithValidation = useDynamicPetWithValidationLoader();
  const randomFailed = useRandomFailedLoader();
  const randomFailedWithValidator = useRandomFailedWithValidatorLoader();

  return (
    <div>
      <div>{pet.value.pet}</div>
      <div>
        {petWithValidation.value.pet}
        {petWithValidation.value.failed}
        {petWithValidation.value.validationFailReason}
      </div>
      <div>
        {dynamicPet.value.dog}
        {dynamicPet.value.rat}
      </div>
      <div>
        {dynamicPetWithValidation.value.dog}
        {dynamicPetWithValidation.value.rat}
        {dynamicPetWithValidation.value.failed}
        {dynamicPetWithValidation.value.validationFailReason}
      </div>
      <div>
        {randomFailed.value.pet}
        {randomFailed.value.failed}
        {randomFailed.value.loaderFailedReason}
      </div>
      <div>
        {randomFailedWithValidator.value.pet}
        {randomFailedWithValidator.value.failed}
        {randomFailedWithValidator.value.loaderFailedReason}
        {randomFailedWithValidator.value.validationFailReason}
      </div>
    </div>
  );
});
