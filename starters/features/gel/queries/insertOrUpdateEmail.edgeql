with 
  NewEmail := (
    insert Email {
      address := <str>$address,
      provider := <str>$package_version,
      user := (
        select User
        filter .name = <str>$name
        limit 1
      )
    }
    unless conflict on .address 
    else (
      update Email
      filter .address = <str>$address
      set {
        provider := <str>$package_version,
        user := (
          select User
          filter .name = <str>$name
          limit 1
        )
      }
    )
  )

select NewEmail { ** };
