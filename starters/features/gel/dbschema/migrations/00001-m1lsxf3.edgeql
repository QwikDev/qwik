CREATE MIGRATION m1lsxf35vjd6q2xigdqcpwqnstmu4g6hy734hlv46eoohih7bq2ttq
    ONTO initial
{
  CREATE FUTURE simple_scoping;
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
      CREATE PROPERTY email: std::str {
          CREATE CONSTRAINT std::exclusive;
      };
      CREATE INDEX ON (.email);
      CREATE PROPERTY has_profile: std::bool;
      CREATE REQUIRED PROPERTY name: std::str;
  };
};
