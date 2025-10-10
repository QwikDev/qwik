delete User
filter
  (
    (assert_exists(User.name) ?= <optional str>$name) ??
    (assert_exists(User.email) ?= <optional str>$email)
  );
