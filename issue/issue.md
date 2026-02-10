# Issue

make a plan to address these issues in the lib/beautiful-mermaid. Then execute as the plan, make sure you validate the result after every attempt to fix

## 1

code

```
flowchart TD
    P1["1. Credential Origin<br/><i>3rd party creates credential material</i>"]
    P2["2. Admin Input<br/><i>Admin enters credentials in Axon Connect UI</i>"]
    P3["3. Credential Resolution<br/><i>OTS resolves input into runtime credentials</i>"]
    P4["4. Credential Storage<br/><i>App Service encrypts & persists</i>"]
    P5["5. Runtime Token Acquisition<br/><i>OTS gets access token from 3rd party</i>"]

    P1 -->|"credential material"| P2
    P2 -->|"raw input"| P3
    P3 -->|"resolved credentials"| P4
    P4 -->|"encrypted credentials"| P5

    P3 -.- M["authMethod"]
    P4 -.- C["credentialType"]
    P5 -.- G["grantTypes"]
```

result: issue/image.png

- there are redundant part of some lines, e.g: in the issue/image.png, the
  edges: `3. Credential...` to `authMethod` and `4. Credential...` to `credentialType` are having
  a weird shape with a part of the line is redundant
