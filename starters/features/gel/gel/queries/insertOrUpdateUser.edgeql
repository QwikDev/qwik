with 
  NewUser := (
    insert User {
      name := <str>$name,
      description := <str>$package_version,
      has_profile :=  <bool>$has_profile,
    }
    unless conflict on .name 
    else (
      update User
      filter .name = <str>$name
      set {
        package_version := <str>$package_version,
        description := <str>$package_version,
        has_profile :=  <bool>$has_profile,
      }
    )
  ),

  InsertEmails := (
    for email in array_unpack(<array<tuple<address: str, provider: str>>>$dependencies)
    union (
      insert Email {
        address := <str>email.address,
        provider := <str>email.provider,
        user := NewUser,
      }
      unless conflict on (.address)
      else (
        update Email
        filter .address = <str>email.address
        set {
          provider := <str>email.provider,
        }
      )
    )
  ),

select NewUser { ** };
