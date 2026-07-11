// 20 hardcoded LeetCode-style problems for interview mode.
// Each problem has:
//   starter_code  — what the candidate sees (class + stub)
//   harness       — appended at runtime; reads JSON stdin, calls solution, prints JSON stdout
//   test_cases    — [{input: json_string, expected: string}]  (expected must match harness output exactly after trim)

const _LL_HELPERS = `
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def _arr_to_ll(arr):
    if not arr: return None
    head = ListNode(arr[0])
    cur = head
    for v in arr[1:]: cur.next = ListNode(v); cur = cur.next
    return head

def _ll_to_arr(node):
    res = []
    while node: res.append(node.val); node = node.next
    return res
`

const _TREE_HELPERS = `
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right

def _build_tree(vals):
    if not vals or vals[0] is None: return None
    root = TreeNode(vals[0])
    from collections import deque
    q = deque([root]); i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals) and vals[i] is not None:
            node.left = TreeNode(vals[i]); q.append(node.left)
        i += 1
        if i < len(vals) and vals[i] is not None:
            node.right = TreeNode(vals[i]); q.append(node.right)
        i += 1
    return root
`

export const INTERVIEW_PROBLEMS = [

  // ─── 1. Two Sum ─────────────────────────────────────────────────────────────
  {
    id: 1, title: 'Two Sum', difficulty: 'Easy', topic: 'arrays',
    problem: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] == 9' },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]' },
    ],
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9', 'Only one valid answer exists.'],
    starter_code:
`class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
_sol = Solution()
_r = _sol.twoSum(_d['nums'], _d['target'])
print(json.dumps(sorted(_r)))
`,
    test_cases: [
      { input: '{"nums":[2,7,11,15],"target":9}',  expected: '[0, 1]' },
      { input: '{"nums":[3,2,4],"target":6}',       expected: '[1, 2]' },
      { input: '{"nums":[3,3],"target":6}',         expected: '[0, 1]' },
      { input: '{"nums":[1,2,3,4,5],"target":9}',  expected: '[3, 4]' },
      { input: '{"nums":[-1,-2,-3,-4,-5],"target":-8}', expected: '[2, 4]' },
      { input: '{"nums":[0,4,3,0],"target":0}',    expected: '[0, 3]' },
      { input: '{"nums":[1,5,5],"target":10}',      expected: '[1, 2]' },
      { input: '{"nums":[100,200,300],"target":500}', expected: '[1, 2]' },
    ],
  },

  // ─── 2. Best Time to Buy and Sell Stock ─────────────────────────────────────
  {
    id: 2, title: 'Best Time to Buy and Sell Stock', difficulty: 'Easy', topic: 'arrays',
    problem: 'You are given an array prices where prices[i] is the price of a given stock on the ith day. You want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock. Return the maximum profit you can achieve from this transaction. If you cannot achieve any profit, return 0.',
    examples: [
      { input: 'prices = [7,1,5,3,6,4]', output: '5', explanation: 'Buy on day 2 (price=1) sell on day 5 (price=6)' },
      { input: 'prices = [7,6,4,3,1]', output: '0', explanation: 'No profit possible' },
    ],
    constraints: ['1 <= prices.length <= 10^5', '0 <= prices[i] <= 10^4'],
    starter_code:
`class Solution:
    def maxProfit(self, prices: list[int]) -> int:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().maxProfit(_d['prices'])))
`,
    test_cases: [
      { input: '{"prices":[7,1,5,3,6,4]}', expected: '5' },
      { input: '{"prices":[7,6,4,3,1]}',   expected: '0' },
      { input: '{"prices":[1,2]}',          expected: '1' },
      { input: '{"prices":[2,4,1]}',        expected: '2' },
      { input: '{"prices":[3,3]}',          expected: '0' },
      { input: '{"prices":[1,2,3,4,5]}',   expected: '4' },
      { input: '{"prices":[5,4,3,2,1]}',   expected: '0' },
      { input: '{"prices":[1]}',            expected: '0' },
      { input: '{"prices":[2,1,2,0,1]}',   expected: '1' },
    ],
  },

  // ─── 3. Product of Array Except Self ────────────────────────────────────────
  {
    id: 3, title: 'Product of Array Except Self', difficulty: 'Medium', topic: 'arrays',
    problem: 'Given an integer array nums, return an array answer such that answer[i] is equal to the product of all the elements of nums except nums[i]. The product of any prefix or suffix of nums is guaranteed to fit in a 32-bit integer. You must write an algorithm that runs in O(n) time and without using the division operation.',
    examples: [
      { input: 'nums = [1,2,3,4]', output: '[24,12,8,6]' },
      { input: 'nums = [-1,1,0,-3,3]', output: '[0,0,9,0,0]' },
    ],
    constraints: ['2 <= nums.length <= 10^5', '-30 <= nums[i] <= 30'],
    starter_code:
`class Solution:
    def productExceptSelf(self, nums: list[int]) -> list[int]:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().productExceptSelf(_d['nums'])))
`,
    test_cases: [
      { input: '{"nums":[1,2,3,4]}',       expected: '[24, 12, 8, 6]' },
      { input: '{"nums":[-1,1,0,-3,3]}',   expected: '[0, 0, 9, 0, 0]' },
      { input: '{"nums":[1,1]}',            expected: '[1, 1]' },
      { input: '{"nums":[2,3,4,5]}',        expected: '[60, 40, 30, 24]' },
      { input: '{"nums":[0,0]}',            expected: '[0, 0]' },
      { input: '{"nums":[-1,-2,-3,-4]}',   expected: '[-24, 12, -8, 6]' },
      { input: '{"nums":[1,2,3]}',          expected: '[6, 3, 2]' },
    ],
  },

  // ─── 4. Valid Anagram ────────────────────────────────────────────────────────
  {
    id: 4, title: 'Valid Anagram', difficulty: 'Easy', topic: 'strings',
    problem: 'Given two strings s and t, return true if t is an anagram of s, and false otherwise. An Anagram is a word or phrase formed by rearranging the letters of a different word or phrase, typically using all the original letters exactly once.',
    examples: [
      { input: 's = "anagram", t = "nagaram"', output: 'true' },
      { input: 's = "rat", t = "car"', output: 'false' },
    ],
    constraints: ['1 <= s.length, t.length <= 5 * 10^4', 's and t consist of lowercase English letters.'],
    starter_code:
`class Solution:
    def isAnagram(self, s: str, t: str) -> bool:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().isAnagram(_d['s'], _d['t'])))
`,
    test_cases: [
      { input: '{"s":"anagram","t":"nagaram"}', expected: 'true' },
      { input: '{"s":"rat","t":"car"}',         expected: 'false' },
      { input: '{"s":"a","t":"a"}',             expected: 'true' },
      { input: '{"s":"ab","t":"a"}',            expected: 'false' },
      { input: '{"s":"","t":""}',               expected: 'true' },
      { input: '{"s":"aacc","t":"ccac"}',       expected: 'false' },
      { input: '{"s":"listen","t":"silent"}',   expected: 'true' },
      { input: '{"s":"hello","t":"world"}',     expected: 'false' },
      { input: '{"s":"abc","t":"cba"}',         expected: 'true' },
    ],
  },

  // ─── 5. Valid Palindrome ─────────────────────────────────────────────────────
  {
    id: 5, title: 'Valid Palindrome', difficulty: 'Easy', topic: 'strings',
    problem: 'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers. Given a string s, return true if it is a palindrome, or false otherwise.',
    examples: [
      { input: 's = "A man, a plan, a canal: Panama"', output: 'true' },
      { input: 's = "race a car"', output: 'false' },
      { input: 's = " "', output: 'true' },
    ],
    constraints: ['1 <= s.length <= 2 * 10^5'],
    starter_code:
`class Solution:
    def isPalindrome(self, s: str) -> bool:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().isPalindrome(_d['s'])))
`,
    test_cases: [
      { input: '{"s":"A man, a plan, a canal: Panama"}', expected: 'true' },
      { input: '{"s":"race a car"}',                      expected: 'false' },
      { input: '{"s":" "}',                               expected: 'true' },
      { input: '{"s":"0P"}',                              expected: 'false' },
      { input: '{"s":"Was it a car or a cat I saw?"}',    expected: 'true' },
      { input: '{"s":"ab"}',                              expected: 'false' },
      { input: '{"s":"a"}',                               expected: 'true' },
      { input: '{"s":"12321"}',                           expected: 'true' },
      { input: '{"s":"No lemon, no melon"}',              expected: 'true' },
    ],
  },

  // ─── 6. 3Sum ─────────────────────────────────────────────────────────────────
  {
    id: 6, title: '3Sum', difficulty: 'Medium', topic: 'arrays',
    problem: 'Given an integer array nums, return all the triplets [nums[i], nums[j], nums[k]] such that i != j, i != k, and j != k, and nums[i] + nums[j] + nums[k] == 0. Notice that the solution set must not contain duplicate triplets.',
    examples: [
      { input: 'nums = [-1,0,1,2,-1,-4]', output: '[[-1,-1,2],[-1,0,1]]' },
      { input: 'nums = [0,1,1]', output: '[]' },
      { input: 'nums = [0,0,0]', output: '[[0,0,0]]' },
    ],
    constraints: ['3 <= nums.length <= 3000', '-10^5 <= nums[i] <= 10^5'],
    starter_code:
`class Solution:
    def threeSum(self, nums: list[int]) -> list[list[int]]:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
_r = Solution().threeSum(_d['nums'])
_r = sorted([sorted(t) for t in _r])
print(json.dumps(_r))
`,
    test_cases: [
      { input: '{"nums":[-1,0,1,2,-1,-4]}', expected: '[[-1, -1, 2], [-1, 0, 1]]' },
      { input: '{"nums":[0,1,1]}',           expected: '[]' },
      { input: '{"nums":[0,0,0]}',           expected: '[[0, 0, 0]]' },
      { input: '{"nums":[-2,0,0,2,2]}',      expected: '[[-2, 0, 2]]' },
      { input: '{"nums":[1,2,3]}',           expected: '[]' },
      { input: '{"nums":[-4,-2,-2,-2,0,1,2,2,2,3,3,4,4,6,6]}', expected: '[[-4, -2, 6], [-4, 0, 4], [-4, 1, 3], [-4, 2, 2], [-2, -2, 4], [-2, 0, 2]]' },
    ],
  },

  // ─── 7. Longest Substring Without Repeating Characters ──────────────────────
  {
    id: 7, title: 'Longest Substring Without Repeating Characters', difficulty: 'Medium', topic: 'strings',
    problem: 'Given a string s, find the length of the longest substring without repeating characters.',
    examples: [
      { input: 's = "abcabcbb"', output: '3', explanation: '"abc" is the longest substring.' },
      { input: 's = "bbbbb"', output: '1' },
      { input: 's = "pwwkew"', output: '3', explanation: '"wke" is the answer.' },
    ],
    constraints: ['0 <= s.length <= 5 * 10^4'],
    starter_code:
`class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().lengthOfLongestSubstring(_d['s'])))
`,
    test_cases: [
      { input: '{"s":"abcabcbb"}', expected: '3' },
      { input: '{"s":"bbbbb"}',    expected: '1' },
      { input: '{"s":"pwwkew"}',   expected: '3' },
      { input: '{"s":""}',         expected: '0' },
      { input: '{"s":"au"}',       expected: '2' },
      { input: '{"s":"dvdf"}',     expected: '3' },
      { input: '{"s":"abba"}',     expected: '2' },
      { input: '{"s":"tmmzuxt"}',  expected: '5' },
      { input: '{"s":"aab"}',      expected: '2' },
    ],
  },

  // ─── 8. Reverse Linked List ──────────────────────────────────────────────────
  {
    id: 8, title: 'Reverse Linked List', difficulty: 'Easy', topic: 'linked lists',
    problem: 'Given the head of a singly linked list, reverse the list, and return the reversed list.',
    examples: [
      { input: 'head = [1,2,3,4,5]', output: '[5,4,3,2,1]' },
      { input: 'head = [1,2]', output: '[2,1]' },
      { input: 'head = []', output: '[]' },
    ],
    constraints: ['The number of nodes in the list is [0, 5000].', '-5000 <= Node.val <= 5000'],
    starter_code:
`class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class Solution:
    def reverseList(self, head: ListNode) -> ListNode:
        pass
`,
    harness:
`import json, sys
def _arr_to_ll(a):
    if not a: return None
    h = ListNode(a[0]); c = h
    for v in a[1:]: c.next = ListNode(v); c = c.next
    return h
def _ll_to_arr(n):
    r = []
    while n: r.append(n.val); n = n.next
    return r
_d = json.loads(sys.stdin.read())
print(json.dumps(_ll_to_arr(Solution().reverseList(_arr_to_ll(_d['head'])))))
`,
    test_cases: [
      { input: '{"head":[1,2,3,4,5]}', expected: '[5, 4, 3, 2, 1]' },
      { input: '{"head":[1,2]}',        expected: '[2, 1]' },
      { input: '{"head":[]}',           expected: '[]' },
      { input: '{"head":[1]}',          expected: '[1]' },
      { input: '{"head":[1,2,3]}',      expected: '[3, 2, 1]' },
      { input: '{"head":[5,4,3,2,1]}', expected: '[1, 2, 3, 4, 5]' },
      { input: '{"head":[1,1,1]}',      expected: '[1, 1, 1]' },
    ],
  },

  // ─── 9. Merge Two Sorted Lists ───────────────────────────────────────────────
  {
    id: 9, title: 'Merge Two Sorted Lists', difficulty: 'Easy', topic: 'linked lists',
    problem: 'You are given the heads of two sorted linked lists list1 and list2. Merge the two lists into one sorted list. The list should be made by splicing together the nodes of the first two lists. Return the head of the merged linked list.',
    examples: [
      { input: 'list1 = [1,2,4], list2 = [1,3,4]', output: '[1,1,2,3,4,4]' },
      { input: 'list1 = [], list2 = []', output: '[]' },
      { input: 'list1 = [], list2 = [0]', output: '[0]' },
    ],
    constraints: ['The number of nodes in both lists is in [0, 50].', '-100 <= Node.val <= 100', 'Both list1 and list2 are sorted in non-decreasing order.'],
    starter_code:
`class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class Solution:
    def mergeTwoLists(self, list1: ListNode, list2: ListNode) -> ListNode:
        pass
`,
    harness:
`import json, sys
def _arr_to_ll(a):
    if not a: return None
    h = ListNode(a[0]); c = h
    for v in a[1:]: c.next = ListNode(v); c = c.next
    return h
def _ll_to_arr(n):
    r = []
    while n: r.append(n.val); n = n.next
    return r
_d = json.loads(sys.stdin.read())
print(json.dumps(_ll_to_arr(Solution().mergeTwoLists(_arr_to_ll(_d['l1']), _arr_to_ll(_d['l2'])))))
`,
    test_cases: [
      { input: '{"l1":[1,2,4],"l2":[1,3,4]}',   expected: '[1, 1, 2, 3, 4, 4]' },
      { input: '{"l1":[],"l2":[]}',               expected: '[]' },
      { input: '{"l1":[],"l2":[0]}',              expected: '[0]' },
      { input: '{"l1":[1,3,5],"l2":[2,4,6]}',    expected: '[1, 2, 3, 4, 5, 6]' },
      { input: '{"l1":[1],"l2":[1]}',             expected: '[1, 1]' },
      { input: '{"l1":[1,2,3],"l2":[]}',          expected: '[1, 2, 3]' },
      { input: '{"l1":[5],"l2":[1,2,4]}',         expected: '[1, 2, 4, 5]' },
      { input: '{"l1":[1,4,7],"l2":[2,3,8]}',    expected: '[1, 2, 3, 4, 7, 8]' },
    ],
  },

  // ─── 10. Linked List Cycle ───────────────────────────────────────────────────
  {
    id: 10, title: 'Linked List Cycle', difficulty: 'Easy', topic: 'linked lists',
    problem: 'Given head, the head of a linked list, determine if the linked list has a cycle in it. There is a cycle in a linked list if there is some node in the list that can be reached again by continuously following the next pointer. Return true if there is a cycle in the linked list, otherwise, return false.',
    examples: [
      { input: 'head = [3,2,0,-4], pos = 1', output: 'true', explanation: 'Tail connects to node at index 1' },
      { input: 'head = [1,2], pos = 0', output: 'true' },
      { input: 'head = [1], pos = -1', output: 'false' },
    ],
    constraints: ['0 <= nodes <= 10^4', 'pos is -1 or a valid index'],
    starter_code:
`class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class Solution:
    def hasCycle(self, head: ListNode) -> bool:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
_vals, _pos = _d['head'], _d['pos']
_nodes = [ListNode(v) for v in _vals]
for i in range(len(_nodes)-1): _nodes[i].next = _nodes[i+1]
if _pos != -1 and _nodes: _nodes[-1].next = _nodes[_pos]
print(json.dumps(Solution().hasCycle(_nodes[0] if _nodes else None)))
`,
    test_cases: [
      { input: '{"head":[3,2,0,-4],"pos":1}', expected: 'true' },
      { input: '{"head":[1,2],"pos":0}',       expected: 'true' },
      { input: '{"head":[1],"pos":-1}',        expected: 'false' },
      { input: '{"head":[],"pos":-1}',         expected: 'false' },
      { input: '{"head":[1,2,3,4],"pos":2}',  expected: 'true' },
      { input: '{"head":[1,2,3],"pos":-1}',   expected: 'false' },
      { input: '{"head":[1],"pos":0}',         expected: 'true' },
    ],
  },

  // ─── 11. Valid Parentheses ───────────────────────────────────────────────────
  {
    id: 11, title: 'Valid Parentheses', difficulty: 'Easy', topic: 'strings',
    problem: 'Given a string s containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid. An input string is valid if: Open brackets must be closed by the same type of brackets, open brackets must be closed in the correct order, and every close bracket has a corresponding open bracket of the same type.',
    examples: [
      { input: 's = "()"', output: 'true' },
      { input: 's = "()[]{}"', output: 'true' },
      { input: 's = "(]"', output: 'false' },
    ],
    constraints: ['1 <= s.length <= 10^4', 's consists of parentheses only'],
    starter_code:
`class Solution:
    def isValid(self, s: str) -> bool:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().isValid(_d['s'])))
`,
    test_cases: [
      { input: '{"s":"()"}',       expected: 'true' },
      { input: '{"s":"()[]{}"}',   expected: 'true' },
      { input: '{"s":"(]"}',       expected: 'false' },
      { input: '{"s":"([)]"}',     expected: 'false' },
      { input: '{"s":"{[]}"}',     expected: 'true' },
      { input: '{"s":""}',         expected: 'true' },
      { input: '{"s":"["}',        expected: 'false' },
      { input: '{"s":"(("}',       expected: 'false' },
      { input: '{"s":"}{"}',       expected: 'false' },
      { input: '{"s":"((()))"}',   expected: 'true' },
    ],
  },

  // ─── 12. Maximum Depth of Binary Tree ───────────────────────────────────────
  {
    id: 12, title: 'Maximum Depth of Binary Tree', difficulty: 'Easy', topic: 'trees',
    problem: 'Given the root of a binary tree, return its maximum depth. A binary tree\'s maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.',
    examples: [
      { input: 'root = [3,9,20,null,null,15,7]', output: '3' },
      { input: 'root = [1,null,2]', output: '2' },
    ],
    constraints: ['0 <= nodes <= 10^4', '-100 <= Node.val <= 100'],
    starter_code:
`class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class Solution:
    def maxDepth(self, root: TreeNode) -> int:
        pass
`,
    harness:
`import json, sys
from collections import deque
def _build(vals):
    if not vals or vals[0] is None: return None
    root = TreeNode(vals[0]); q = deque([root]); i = 1
    while q and i < len(vals):
        n = q.popleft()
        if i < len(vals) and vals[i] is not None: n.left = TreeNode(vals[i]); q.append(n.left)
        i += 1
        if i < len(vals) and vals[i] is not None: n.right = TreeNode(vals[i]); q.append(n.right)
        i += 1
    return root
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().maxDepth(_build(_d['root']))))
`,
    test_cases: [
      { input: '{"root":[3,9,20,null,null,15,7]}', expected: '3' },
      { input: '{"root":[1,null,2]}',               expected: '2' },
      { input: '{"root":[]}',                       expected: '0' },
      { input: '{"root":[1]}',                      expected: '1' },
      { input: '{"root":[1,2,3,4,5]}',              expected: '3' },
      { input: '{"root":[1,2,null,3,null,4]}',      expected: '4' },
      { input: '{"root":[1,2,3]}',                  expected: '2' },
    ],
  },

  // ─── 13. Validate Binary Search Tree ────────────────────────────────────────
  {
    id: 13, title: 'Validate Binary Search Tree', difficulty: 'Medium', topic: 'trees',
    problem: 'Given the root of a binary tree, determine if it is a valid binary search tree (BST). A valid BST is defined as follows: The left subtree of a node contains only nodes with keys less than the node\'s key. The right subtree of a node contains only nodes with keys greater than the node\'s key. Both the left and right subtrees must also be binary search trees.',
    examples: [
      { input: 'root = [2,1,3]', output: 'true' },
      { input: 'root = [5,1,4,null,null,3,6]', output: 'false', explanation: 'Root is 5 but right child is 4.' },
    ],
    constraints: ['1 <= nodes <= 10^4', '-2^31 <= Node.val <= 2^31 - 1'],
    starter_code:
`class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class Solution:
    def isValidBST(self, root: TreeNode) -> bool:
        pass
`,
    harness:
`import json, sys
from collections import deque
def _build(vals):
    if not vals or vals[0] is None: return None
    root = TreeNode(vals[0]); q = deque([root]); i = 1
    while q and i < len(vals):
        n = q.popleft()
        if i < len(vals) and vals[i] is not None: n.left = TreeNode(vals[i]); q.append(n.left)
        i += 1
        if i < len(vals) and vals[i] is not None: n.right = TreeNode(vals[i]); q.append(n.right)
        i += 1
    return root
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().isValidBST(_build(_d['root']))))
`,
    test_cases: [
      { input: '{"root":[2,1,3]}',                         expected: 'true' },
      { input: '{"root":[5,1,4,null,null,3,6]}',           expected: 'false' },
      { input: '{"root":[2,2,2]}',                         expected: 'false' },
      { input: '{"root":[1]}',                             expected: 'true' },
      { input: '{"root":[5,4,6,null,null,3,7]}',           expected: 'false' },
      { input: '{"root":[3,1,5,0,2,4,6]}',                expected: 'true' },
      { input: '{"root":[10,5,15,null,null,6,20]}',        expected: 'false' },
      { input: '{"root":[1,null,2]}',                      expected: 'true' },
    ],
  },

  // ─── 14. Lowest Common Ancestor of a BST ────────────────────────────────────
  {
    id: 14, title: 'Lowest Common Ancestor of a Binary Search Tree', difficulty: 'Medium', topic: 'trees',
    problem: 'Given a binary search tree (BST), find the lowest common ancestor (LCA) node of two given nodes in the BST. The lowest common ancestor is defined between two nodes p and q as the lowest node in T that has both p and q as descendants (where we allow a node to be a descendant of itself).',
    examples: [
      { input: 'root=[6,2,8,0,4,7,9,null,null,3,5], p=2, q=8', output: '6' },
      { input: 'root=[6,2,8,0,4,7,9,null,null,3,5], p=2, q=4', output: '2' },
    ],
    constraints: ['2 <= nodes <= 10^5', 'All Node.val are unique.', 'p != q, both p and q exist in BST'],
    starter_code:
`class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class Solution:
    def lowestCommonAncestor(self, root: TreeNode, p: TreeNode, q: TreeNode) -> TreeNode:
        pass
`,
    harness:
`import json, sys
from collections import deque
def _build(vals):
    if not vals or vals[0] is None: return None
    root = TreeNode(vals[0]); q = deque([root]); i = 1
    while q and i < len(vals):
        n = q.popleft()
        if i < len(vals) and vals[i] is not None: n.left = TreeNode(vals[i]); q.append(n.left)
        i += 1
        if i < len(vals) and vals[i] is not None: n.right = TreeNode(vals[i]); q.append(n.right)
        i += 1
    return root
def _find(root, val):
    if not root: return None
    if root.val == val: return root
    return _find(root.left, val) or _find(root.right, val)
_d = json.loads(sys.stdin.read())
_root = _build(_d['root'])
print(json.dumps(Solution().lowestCommonAncestor(_root, _find(_root,_d['p']), _find(_root,_d['q'])).val))
`,
    test_cases: [
      { input: '{"root":[6,2,8,0,4,7,9,null,null,3,5],"p":2,"q":8}', expected: '6' },
      { input: '{"root":[6,2,8,0,4,7,9,null,null,3,5],"p":2,"q":4}', expected: '2' },
      { input: '{"root":[2,1],"p":2,"q":1}',                          expected: '2' },
      { input: '{"root":[6,2,8,0,4,7,9,null,null,3,5],"p":3,"q":5}', expected: '4' },
      { input: '{"root":[6,2,8,0,4,7,9,null,null,3,5],"p":0,"q":9}', expected: '6' },
      { input: '{"root":[6,2,8,0,4,7,9,null,null,3,5],"p":7,"q":9}', expected: '8' },
    ],
  },

  // ─── 15. Binary Search ───────────────────────────────────────────────────────
  {
    id: 15, title: 'Binary Search', difficulty: 'Easy', topic: 'binary search',
    problem: 'Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1. You must write an algorithm with O(log n) runtime complexity.',
    examples: [
      { input: 'nums = [-1,0,3,5,9,12], target = 9', output: '4' },
      { input: 'nums = [-1,0,3,5,9,12], target = 2', output: '-1' },
    ],
    constraints: ['1 <= nums.length <= 10^4', 'All integers in nums are unique.', 'nums is sorted in ascending order.'],
    starter_code:
`class Solution:
    def search(self, nums: list[int], target: int) -> int:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().search(_d['nums'], _d['target'])))
`,
    test_cases: [
      { input: '{"nums":[-1,0,3,5,9,12],"target":9}',  expected: '4' },
      { input: '{"nums":[-1,0,3,5,9,12],"target":2}',  expected: '-1' },
      { input: '{"nums":[5],"target":5}',               expected: '0' },
      { input: '{"nums":[5],"target":3}',               expected: '-1' },
      { input: '{"nums":[1,3,5,7,9,11],"target":1}',   expected: '0' },
      { input: '{"nums":[1,3,5,7,9,11],"target":11}',  expected: '5' },
      { input: '{"nums":[1,3,5,7,9,11],"target":6}',   expected: '-1' },
      { input: '{"nums":[2,4,6,8,10],"target":4}',     expected: '1' },
      { input: '{"nums":[-5,-3,-1,0,2],"target":-3}',  expected: '1' },
    ],
  },

  // ─── 16. Kth Largest Element in an Array ────────────────────────────────────
  {
    id: 16, title: 'Kth Largest Element in an Array', difficulty: 'Medium', topic: 'arrays',
    problem: 'Given an integer array nums and an integer k, return the kth largest element in the array. Note that it is the kth largest element in the sorted order, not the kth distinct element. Can you solve it without sorting?',
    examples: [
      { input: 'nums = [3,2,1,5,6,4], k = 2', output: '5' },
      { input: 'nums = [3,2,3,1,2,4,5,5,6], k = 4', output: '4' },
    ],
    constraints: ['1 <= k <= nums.length <= 10^5', '-10^4 <= nums[i] <= 10^4'],
    starter_code:
`class Solution:
    def findKthLargest(self, nums: list[int], k: int) -> int:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().findKthLargest(_d['nums'], _d['k'])))
`,
    test_cases: [
      { input: '{"nums":[3,2,1,5,6,4],"k":2}',         expected: '5' },
      { input: '{"nums":[3,2,3,1,2,4,5,5,6],"k":4}',   expected: '4' },
      { input: '{"nums":[1],"k":1}',                    expected: '1' },
      { input: '{"nums":[2,1],"k":1}',                  expected: '2' },
      { input: '{"nums":[2,1],"k":2}',                  expected: '1' },
      { input: '{"nums":[5,2,4,1,3,6,0],"k":3}',       expected: '4' },
      { input: '{"nums":[-1,-2,-3,-4,-5],"k":2}',       expected: '-2' },
      { input: '{"nums":[1,1,1,1],"k":3}',              expected: '1' },
    ],
  },

  // ─── 17. Subsets ─────────────────────────────────────────────────────────────
  {
    id: 17, title: 'Subsets', difficulty: 'Medium', topic: 'arrays',
    problem: 'Given an integer array nums of unique elements, return all possible subsets (the power set). The solution set must not contain duplicate subsets. Return the solution in any order.',
    examples: [
      { input: 'nums = [1,2,3]', output: '[[],[1],[2],[1,2],[3],[1,3],[2,3],[1,2,3]]' },
      { input: 'nums = [0]', output: '[[],[0]]' },
    ],
    constraints: ['1 <= nums.length <= 10', 'All elements of nums are unique.', '-10 <= nums[i] <= 10'],
    starter_code:
`class Solution:
    def subsets(self, nums: list[int]) -> list[list[int]]:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
_r = Solution().subsets(_d['nums'])
_r = sorted([sorted(s) for s in _r])
print(json.dumps(_r))
`,
    test_cases: [
      { input: '{"nums":[1,2,3]}', expected: '[[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]' },
      { input: '{"nums":[0]}',     expected: '[[], [0]]' },
      { input: '{"nums":[1,2]}',   expected: '[[], [1], [1, 2], [2]]' },
      { input: '{"nums":[3]}',     expected: '[[], [3]]' },
      { input: '{"nums":[1,2,3,4]}', expected: '[[], [1], [1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 4], [1, 3], [1, 3, 4], [1, 4], [2], [2, 3], [2, 3, 4], [2, 4], [3], [3, 4], [4]]' },
    ],
  },

  // ─── 18. Number of Islands ───────────────────────────────────────────────────
  {
    id: 18, title: 'Number of Islands', difficulty: 'Medium', topic: 'graphs',
    problem: 'Given an m x n 2D binary grid grid which represents a map of \'1\'s (land) and \'0\'s (water), return the number of islands. An island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically. You may assume all four edges of the grid are all surrounded by water.',
    examples: [
      { input: 'grid=[["1","1","1","1","0"],["1","1","0","1","0"],["1","1","0","0","0"],["0","0","0","0","0"]]', output: '1' },
      { input: 'grid=[["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]', output: '3' },
    ],
    constraints: ['1 <= m, n <= 300', 'grid[i][j] is \'0\' or \'1\''],
    starter_code:
`class Solution:
    def numIslands(self, grid: list[list[str]]) -> int:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().numIslands(_d['grid'])))
`,
    test_cases: [
      { input: '{"grid":[["1","1","1","1","0"],["1","1","0","1","0"],["1","1","0","0","0"],["0","0","0","0","0"]]}', expected: '1' },
      { input: '{"grid":[["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]}', expected: '3' },
      { input: '{"grid":[["1"]]}',                         expected: '1' },
      { input: '{"grid":[["0"]]}',                         expected: '0' },
      { input: '{"grid":[["1","0"],["0","1"]]}',           expected: '2' },
      { input: '{"grid":[["1","1"],["1","1"]]}',           expected: '1' },
      { input: '{"grid":[["1","0","1"],["0","0","0"],["1","0","1"]]}', expected: '4' },
      { input: '{"grid":[["0","0","0"],["0","0","0"]]}',   expected: '0' },
    ],
  },

  // ─── 19. Climbing Stairs ─────────────────────────────────────────────────────
  {
    id: 19, title: 'Climbing Stairs', difficulty: 'Easy', topic: 'dynamic programming',
    problem: 'You are climbing a staircase. It takes n steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?',
    examples: [
      { input: 'n = 2', output: '2', explanation: 'Two ways: 1+1 or 2' },
      { input: 'n = 3', output: '3', explanation: '1+1+1, 1+2, 2+1' },
    ],
    constraints: ['1 <= n <= 45'],
    starter_code:
`class Solution:
    def climbStairs(self, n: int) -> int:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().climbStairs(_d['n'])))
`,
    test_cases: [
      { input: '{"n":1}',  expected: '1' },
      { input: '{"n":2}',  expected: '2' },
      { input: '{"n":3}',  expected: '3' },
      { input: '{"n":4}',  expected: '5' },
      { input: '{"n":5}',  expected: '8' },
      { input: '{"n":10}', expected: '89' },
      { input: '{"n":20}', expected: '10946' },
      { input: '{"n":45}', expected: '1836311903' },
    ],
  },

  // ─── 20. House Robber ────────────────────────────────────────────────────────
  {
    id: 20, title: 'House Robber', difficulty: 'Medium', topic: 'dynamic programming',
    problem: 'You are a professional robber planning to rob houses along a street. Each house has a certain amount of money stashed, the only constraint stopping you from robbing each of them is that adjacent houses have security systems connected and it will automatically contact the police if two adjacent houses were broken into on the same night. Given an integer array nums representing the amount of money of each house, return the maximum amount of money you can rob tonight without alerting the police.',
    examples: [
      { input: 'nums = [1,2,3,1]', output: '4', explanation: 'Rob house 1 (money=1) then house 3 (money=3). Total = 4.' },
      { input: 'nums = [2,7,9,3,1]', output: '12', explanation: 'Rob house 1, 3, 5. 2+9+1=12.' },
    ],
    constraints: ['1 <= nums.length <= 100', '0 <= nums[i] <= 400'],
    starter_code:
`class Solution:
    def rob(self, nums: list[int]) -> int:
        pass
`,
    harness:
`import json, sys
_d = json.loads(sys.stdin.read())
print(json.dumps(Solution().rob(_d['nums'])))
`,
    test_cases: [
      { input: '{"nums":[1,2,3,1]}',   expected: '4' },
      { input: '{"nums":[2,7,9,3,1]}', expected: '12' },
      { input: '{"nums":[1]}',         expected: '1' },
      { input: '{"nums":[2,1]}',       expected: '2' },
      { input: '{"nums":[1,2,3]}',     expected: '4' },
      { input: '{"nums":[2,1,1,2]}',   expected: '4' },
      { input: '{"nums":[0,0,0]}',     expected: '0' },
      { input: '{"nums":[5,1,1,5]}',   expected: '10' },
      { input: '{"nums":[1,3,1,3,100]}', expected: '103' },
    ],
  },
]

// Pick a random problem, never repeating the last picked id.
// topic/difficulty are optional filters; pass null/undefined to pick from all 20.
let _lastPickedId = null

export function pickProblem(topic = null, difficulty = null) {
  let pool = [...INTERVIEW_PROBLEMS]

  // Filter by topic if a real topic is given
  if (topic && topic !== 'random') {
    const t = topic.toLowerCase()
    const filtered = pool.filter(p => p.topic.toLowerCase().includes(t))
    if (filtered.length) pool = filtered
  }

  // Filter by difficulty if a real difficulty is given
  if (difficulty && difficulty !== 'Random') {
    const filtered = pool.filter(p => p.difficulty === difficulty)
    if (filtered.length) pool = filtered
  }

  // Exclude last picked so we never show the same problem twice in a row
  const candidates = pool.length > 1 ? pool.filter(p => p.id !== _lastPickedId) : pool

  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  _lastPickedId = picked.id
  return picked
}
