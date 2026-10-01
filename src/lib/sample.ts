/** A tiny structured sample book so the engine can be tried without a real import. */
export const SAMPLE_BOOK = {
  title: "C# Essentials — Local Reference",
  author: "Sample Author",
  subject: "C# / .NET",
  chapters: [
    {
      number: 1,
      title: "Variables and Types",
      sections: [
        {
          title: "Declaring values",
          pages: [
            {
              page: 1,
              text: "In C# every value has a type. A variable is declared with a type and a name, for example int count = 0; or string name = \"Ada\". The type tells the compiler how much space the value needs and which operations are allowed. Use var when the compiler can infer the type from the right-hand side, such as var total = 10 + 5; which becomes an int. Value types (int, double, bool, struct) store their data directly, while reference types (string, arrays, classes) store a reference to data on the heap. A string is immutable, so every string operation returns a new string rather than changing the original.",
            },
          ],
        },
        {
          title: "Conversion and parsing",
          pages: [
            {
              page: 8,
              text: "Converting between types is a common task. Implicit conversions happen automatically when no data can be lost, for example an int can become a double. Explicit conversions (casts) use parentheses: double d = 3.9; int i = (int)d; truncates toward zero. For text, use int.Parse, double.Parse, or the safer int.TryParse which returns a bool and an out parameter instead of throwing. Always prefer TryParse when the input comes from a file or a user, because parse failures throw FormatException.",
            },
          ],
        },
      ],
    },
    {
      number: 2,
      title: "Control Flow",
      sections: [
        {
          title: "Branches and loops",
          pages: [
            {
              page: 22,
              text: "Conditional logic uses if, else if and else, and the switch statement for many fixed cases. Modern C# switch expressions return a value with the => syntax. Loops include for when the count is known, while when it is not, and foreach for anything that implements IEnumerable. Use break to leave a loop early and continue to skip to the next iteration. Guards at the top of a method that return early keep nesting shallow and make the happy path obvious.",
            },
          ],
        },
      ],
    },
    {
      number: 3,
      title: "Classes and Objects",
      sections: [
        {
          title: "Defining a class",
          pages: [
            {
              page: 40,
              text: "A class is a blueprint that bundles data (fields) with behaviour (methods). An object is a concrete instance created with the new keyword, for example var person = new Person(\"Ada\");. Constructors initialise an object and share the class name. Encapsulation means fields are private and exposed through properties, which are methods that look like fields: public string Name { get; set; }. An auto-property generates the backing field for you. Static members belong to the type itself rather than to an instance.",
            },
          ],
        },
        {
          title: "Inheritance and composition",
          pages: [
            {
              page: 48,
              text: "Inheritance lets one class extend another with the : syntax, and virtual/override let a subclass replace behaviour. Prefer composition over deep inheritance hierarchies: give a class a field that holds another object instead of deriving from it. Interfaces describe a contract with no implementation, such as IDisposable, and a class may implement many interfaces. Program against interfaces so implementations can be swapped later.",
            },
          ],
        },
      ],
    },
    {
      number: 4,
      title: "Collections",
      sections: [
        {
          title: "Lists, dictionaries and sets",
          pages: [
            {
              page: 64,
              text: "List<T> is a resizable array and the default choice for an ordered collection. Dictionary<TKey, TValue> maps unique keys to values with fast lookups and is ideal for grouping and counting. HashSet<T> stores unique items and answers Contains in constant time. Queue<T> and Stack<T> model first-in-first-out and last-in-first-out processing. Prefer these generic collections over the old non-generic ArrayList, which boxes value types and loses type safety.",
            },
          ],
        },
      ],
    },
    {
      number: 5,
      title: "LINQ",
      sections: [
        {
          title: "Querying in memory",
          pages: [
            {
              page: 82,
              text: "LINQ turns a collection into a query. Fluent syntax chains extension methods: items.Where(x => x.Price > 10).OrderBy(x => x.Name).Select(x => x.Name). GroupBy is the tool for grouping rows by a key, returning a sequence of groups you can then count or aggregate. Query syntax offers the same power with from/where/select keywords. LINQ is lazy: a query runs only when you enumerate it, so materialise with ToList when you need a stable snapshot. Avoid running a query twice by accident, as that repeats the work.",
            },
          ],
        },
      ],
    },
    {
      number: 6,
      title: "Files and Streams",
      sections: [
        {
          title: "Reading text files",
          pages: [
            {
              page: 102,
              text: "The System.IO namespace handles files and streams. File.ReadAllText reads a whole file into a string in one call, which is convenient for small files. For large files read line by line with a StreamReader inside a using block so the handle is released even if an exception is thrown. StreamReader.ReadLine returns null at end of file, which makes a while loop idiomatic. Always use using (or a using declaration) around any IDisposable such as streams and database connections to release resources deterministically.",
            },
          ],
        },
        {
          title: "Writing and parsing CSV",
          pages: [
            {
              page: 110,
              text: "A CSV file is a table of comma-separated rows. To parse it, read each line, split on the delimiter with line.Split(','), and map the resulting fields onto an object. Handle the header line by skipping the first row and using it to name the columns. Quoted fields that contain commas need care: a naive split fails, so strip surrounding quotes and treat a quoted comma as data. When writing CSV use a StreamWriter and escape any field that contains a comma or a quote.",
            },
          ],
        },
      ],
    },
    {
      number: 7,
      title: "Asynchronous Code",
      sections: [
        {
          title: "async and await",
          pages: [
            {
              page: 130,
              text: "A synchronous method blocks its thread until it finishes. An async method returns a Task (or Task<T>) and lets the caller continue without blocking. Mark the method async and await the operation inside it. I/O such as reading a file or an HTTP call benefits most because the thread is freed while waiting. Use Task.WhenAll to run several independent operations at once and await them together. Never block on an async method with .Result or .Wait(), which can deadlock; await it instead. Name async methods with the Async suffix by convention.",
            },
          ],
        },
      ],
    },
    {
      number: 8,
      title: "Errors and Testing",
      sections: [
        {
          title: "Exceptions",
          pages: [
            {
              page: 150,
              text: "Exceptions signal that something went wrong. Catch only the exceptions you can handle, and catch the most specific type first (FormatException before Exception). Do not swallow exceptions with an empty catch block. Use a finally block or a using declaration to guarantee cleanup. Throw with throw new ArgumentNullException(nameof(arg)) to fail fast on bad input, and validate arguments at the top of public methods so errors surface near their cause.",
            },
          ],
        },
        {
          title: "Small tests",
          pages: [
            {
              page: 162,
              text: "A unit test calls one unit of code and asserts an expected result. Arrange the inputs, Act by calling the method, and Assert the outcome. Keep each test independent and fast so it can run on every change. Cover the edges: empty input, one item, many items, and invalid input. Tests lock in behaviour and make refactoring safe, so write them for the parts of the system that are most likely to change or break.",
            },
          ],
        },
      ],
    },
  ],
};
