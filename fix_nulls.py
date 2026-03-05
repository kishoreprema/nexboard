with open('style.css', 'rb') as f:
    content = f.read()

# The file likely has a bunch of null bytes inserted due to powershell UTF-16LE append
content = content.replace(b'\x00', b'')

with open('style.css', 'wb') as f:
    f.write(content)
print("Null bytes removed from style.css")
