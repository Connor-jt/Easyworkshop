



write_file = open("out_enum.txt", "w")
write_file.write("var enum_dict = {\n")

with open("enum.txt") as file:
    for line in file:
        l = line.lstrip()
        # skip the obsolete lines!!
        if len(l) == 0 or l[0] == '[]': continue

        vals = l.split(" = ")
        if len(vals) != 2: continue

        # remove comma at the end of the enum value if it has it
        enum_index = vals[1].rstrip()
        if enum_index[-1] == ",": enum_index = enum_index[:-1]

        write_file.write(enum_index + ": \"" + vals[0] + "\",\n")

        
write_file.write("};")