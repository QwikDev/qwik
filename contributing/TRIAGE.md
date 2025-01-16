# Triage Titans Guide

Hey there! Welcome to the wild world of the **Triage Titans**, where we tame bugs and nurture enhancements with the precision of true repository doctors.

Let's keep the code healthy, the project smooth, and have some fun along the way.

## Note about tags prefixes:

1. **STATUS-1**: The initial `needs triage` gets automatically added to newly created issues
2. **STATUS-2**: A "waiting for someone/something" status.
3. **STATUS-3**: The final state of an issue. This is a "resolution" status.

---

👇 _Inspiration for the diagrams below came from the Vite project_

## Bug Triaging Process

Our bug triaging process makes sure every reported issue gets the attention it deserves. We categorize, prioritize, and assign bugs to the right person to squash them quickly.

Here's how the Triage Titans handle bug reports in the Qwik repository:

```mermaid
flowchart TD
    start{Missing information?}
    start --YES--> close1[Tag with\n'STATUS-2: missing info'\n\nBot will auto close if\n no update for 14 days]
    start --NO--> dupe{Is duplicate?}
    dupe --YES--> close2[Close, point to duplicate\n and tag with\n'STATUS-3: duplication']
    dupe --NO--> repro{Has proper\nreproduction?}
    repro --NO--> close3[Tag with\n 'STATUS-2: needs reproduction'\nBot will auto close if \nno update for 14 days]
    repro --YES--> real{Is actually a bug?}
    real --NO--> intended{Is the intended\nbehaviour?}
    intended --YES--> explain[Explain and close.\nPoint to docs if needed.\nTag with\n'STATUS-3: works as expected']
    intended --NO--> open[Tag with\n'STATUS-2: requires discussion'\nand either\n'WAITING FOR: team'\n'WAITING FOR: user']
    real --YES--> real2["1. Tag with 'STATUS-2: team is working on this'\n2. Add related feature label if\napplicable (e.g. 'COMP: runtime')\n3. Add priority labels (see below)"]
    real2 --> unusable{Does the\nbug make Qwik\nunusable?}
    unusable --YES--> maj{Does the bug\naffect the majority\nof Qwik users?}
    maj --YES--> P4[P4: urgent]
    maj --NO--> P3[P3: important]
    unusable --NO--> workarounds{Are there\nworkarounds for\nthe bug?}
    workarounds --NO--> P2[P2: minor]
    workarounds --YES--> P1[P1: nice to have / fix]
```

---

## Enhancement Triaging Process

Alright, Triage Titans! Somebody got a cool new feature idea or an awesome improvement to boost Qwik?

It's our job to make sure these enhancements are properly evaluated, prioritized, and brought to life.

What helps the team to prioritize work is the number of 👍 votes by the community on a specific issue.

### A note about enhancements to the core:

We are very careful about which features we introduce into the Qwik core, because we know that every new feature adds complexity and maintenance tasks to the codebase.

Every feature is being carefully evaluated based on our vision and philosophy of "automatic optimization".

That's why we'll often encourage the community to implement a certain feature and evaluate its adoption over time to see if it should actually be part of the core.

.

Now, let's dive into how we handle enhancement requests in the Qwik repository:

```mermaid
flowchart TD
    start{Missing information?}
    start --YES--> close1[Tag with\n'STATUS-2: missing info'\n\nBot will auto close if\n no update for 14 days]
    start --NO--> dupe{Is duplicate?}
    dupe --YES--> close2[Close, point to duplicate\n and tag with\n'STATUS-3: duplication']
    dupe --NO--> discussion{Requires further\ndiscussion?}
    discussion --YES--> close3[Tag with\n 'STATUS-2: requires discussion'\nand 'WAITING FOR: team'\nor 'WAITING FOR: user']
    discussion --NO--> implement{Should it be\nimplemented by core?}
    implement --NO--> community{Should it be implemented\nby the community?}
    community --YES--> incubate[Close and tag with either\n'STATUS-3: incubation'\nor 'STATUS-2: waiting for community PR'\nand 'COMMUNITY: PR is welcomed']
    community --NO--> wontfix[Close and tag with\n'STATUS-3: won't be worked on']
    implement --YES--> doimplement["1. Tag with 'STATUS-2: team is working on this'\n2. Add related feature label if\napplicable (e.g. 'COMP: runtime')\n3. Add version \nlabels (e.g. 'VERSION: upcoming major')"]
```

## Thank You!

A big shoutout to all our amazing contributors and Triage Titans! Your dedication, creativity, and hard work help keep Qwik running smoothly and evolving with exciting new features. We wouldn't be able to do it without you 🫶

Thank you for being a part of our journey and making Qwik awesome. Keep up the great work, and let's continue building something amazing together!
