import { resetPlatform } from '@builder.io/qwik/testing';

function jestSetupTestFramework() {
  beforeEach(() => {
    resetPlatform();
  });
}

jestSetupTestFramework();
