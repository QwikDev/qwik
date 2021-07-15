# This is a rule definition file. 


def _my_rollup_impl(ctx):
    srcs = ctx.files.srcs + [
        # ctx.actions.declare_file("rollup_example.js")
    ]
    output_file = ctx.actions.declare_file(ctx.label.name + "/some_file.js")
    args = ctx.actions.args()
    args.add("-o", output_file)

    outputs = [
        output_file
    ]

    # describes what to do if the rule needs to be invoked.
    ctx.actions.run(
        inputs = depset(srcs, transitive=[]),
        outputs = outputs,
        executable = ctx.executable._my_rollup,
        arguments = [args],
        progress_message = "Rollup Qwik",
        mnemonic = "RollupQwik",  
    )

    # Describes what are the outputs of this rule so that bazel can beulid a graph.
    return [
        DefaultInfo(files = depset(outputs)),
    ]

# This declares the rule. 
my_rollup = rule(
    implementation = _my_rollup_impl,
    attrs = {
      "deps": attr.label_list(),
      "srcs": attr.label_list(allow_files = True),
      "_my_rollup": attr.label(
          default = Label("//tools:my_rollup_binary"),
          executable = True,
          cfg = "exec",
        ),    
      }
)