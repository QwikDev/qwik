select 
    (
    insert User {
      name := <str>$name,
      email := <str>$email,
      has_profile := <bool>$has_profile,
    }
    unless conflict on .email
  )
  {
    name,
    email,
    has_profile
  }
