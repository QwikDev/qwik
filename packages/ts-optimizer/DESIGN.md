The idea is that we should hold operations performed in a virtual representation, then at the end we do a write with magic string. This allows us to hold all the AST information and only need to parse once.

We should try to avoid cases where we have to reparse or do strange cases of looping over characters and words to make diffs. On the other hand, we should avoid using a printer approach with codegen that is exhaustive and leads to complexity and difficult changes.
