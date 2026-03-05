import os

with open('style.css', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

# The garbage is EXACTLY lines 614 to 700 (index 613 to 699).
del lines[613:700]

with open('style.css', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Garbage sliced perfectly")
