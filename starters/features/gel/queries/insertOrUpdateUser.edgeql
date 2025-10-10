with 
  NewUser := (
    insert User {
      name := <str>$name,
      email := <str>$email,
      has_profile := <bool>$has_profile,
    }
    unless conflict on .name
    else (
      update User
      filter .name = <str>$name
      set {
        email := <str>$email,
        has_profile := <bool>$has_profile,
      }
    )
    unless conflict on .email
    else (
      update User
      filter .email = <str>$email
      set {
        name := <str>$name,
        has_profile := <bool>$has_profile,
      }
    )
  )

select NewUser { ** };
