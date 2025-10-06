CREATE MIGRATION m1nmosduidfn2cl6attui644sivfoenkklq3y6m2b6vacma2pwoeva
    ONTO initial
{
  CREATE FUTURE simple_scoping;
  CREATE TYPE default::Email {
      CREATE REQUIRED PROPERTY address: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE PROPERTY errmessage := ('an email with that address already exists!');
      CREATE PROPERTY provider: std::str;
  };
  CREATE ABSTRACT TYPE default::Timestamped {
      CREATE PROPERTY last_updated: std::datetime {
          CREATE REWRITE
              INSERT 
              USING (std::datetime_of_statement());
          CREATE REWRITE
              UPDATE 
              USING (std::datetime_of_statement());
      };
  };
  CREATE TYPE default::User EXTENDING default::Timestamped {
      CREATE MULTI LINK emails: default::Email;
      CREATE REQUIRED PROPERTY name: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE INDEX ON (.name);
      CREATE PROPERTY description: std::str;
      CREATE PROPERTY errmessage := ('A user with that name already exists!');
      CREATE PROPERTY has_profile: std::bool;
  };
  ALTER TYPE default::Email {
      CREATE REQUIRED LINK user: default::User;
  };
};
