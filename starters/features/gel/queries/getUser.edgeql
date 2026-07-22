select User {
  **
}
filter
  (
    exists(<optional str>$name) and .name = <optional str>$name
  )
  or
  (
    exists(<optional str>$email) and .email = <optional str>$email
  );

