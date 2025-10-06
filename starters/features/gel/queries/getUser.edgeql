select User { **
} filter assert_exists(User.name) ?= <optional str>$name;

# Filter here is optional. 
# If no filter is provided, all Users will be returned.
