export const templates = {
  python:
    'import sys\n\ndef main():\n    data = sys.stdin.read().strip()\n    # Write your solution here\n    print(data)\n\nif __name__ == "__main__":\n    main()\n',
  java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner input = new Scanner(System.in);\n        // Write your solution here\n        if (input.hasNextLine()) System.out.println(input.nextLine());\n    }\n}\n",
  cpp: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string line;\n    getline(cin, line);\n    // Write your solution here\n    cout << line << "\\n";\n    return 0;\n}\n',
  javascript:
    'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf8").trim();\n// Write your solution here\nconsole.log(input);\n',
};
export type Language = keyof typeof templates;
