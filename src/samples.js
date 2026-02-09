export const samples = {
  flowchart: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Fix the code]
    E --> B
    C --> F[Deploy]
    F --> G[Done]`,

  sequence: `sequenceDiagram
    participant Alice
    participant Bob
    participant Charlie
    Alice->>Bob: Hello Bob!
    Bob->>Charlie: Hi Charlie
    Charlie-->>Bob: Hey Bob
    Bob-->>Alice: Hi Alice`,

  state: `stateDiagram-v2
    [*] --> Closed
    Closed --> Connecting : connect
    Connecting --> Connected : success
    Connecting --> Closed : timeout
    Connected --> Disconnecting : close
    Connected --> Reconnecting : error
    Reconnecting --> Connected : success
    Reconnecting --> Closed : max_retries
    Disconnecting --> Closed : done
    Closed --> [*]`,

  class: `classDiagram
    class Animal {
      +String name
      +int age
      +makeSound()
    }
    class Dog {
      +String breed
      +fetch()
    }
    class Cat {
      +String color
      +purr()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,

  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"
    CUSTOMER {
      string name
      string email
    }
    ORDER {
      int id
      date created
    }
    PRODUCT {
      int id
      string name
      float price
    }`,
};
