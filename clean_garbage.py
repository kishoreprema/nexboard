with open('style.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The garbage is between line 614 and line 713.
# Let's cleanly remove it without touching the valid media queries or the new auth block.
# We'll just look for the corrupted comment block and remove until the clean comment block.
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if ". a u t h - p a g e" in line or "/ *" in line:
        if start_idx == -1:
            start_idx = i
    if "/* =========================================================================" in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    del lines[start_idx:end_idx]
    with open('style.css', 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Garbage removed from", start_idx, "to", end_idx)
else:
    print("Garbage not found! Start:", start_idx, "End:", end_idx)
