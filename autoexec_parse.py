from pathlib import Path;
import subprocess;
import sys;

basePath = Path(sys.argv[1]);
mcopyImagePath = sys.argv[2];
autoexecOut = open(sys.argv[3], "w");

# Find the *_single.conf file
# TODO: Consider parsing the .info file to get all config files
configFile = None;
for item in basePath.iterdir():
	if item.name.endswith("_single.conf"):
		configFile = item.open("r");
		break;

# TODO: Report error on config file not found

autoexecLines = None;

# Extract the autoexec section
for l in configFile:
	ls = l.strip();
	if len(ls) > 0 and ls[0] == "#":
		# Comment, skip
		continue;
	elif len(ls) > 0 and ls[0] == "[":
		if ls == "[autoexec]":
			autoexecLines = [];
		elif autoexecLines != None:
			# Another section after autoexec, stop
			break;
	elif autoexecLines != None:
		autoexecLines.append(ls);

def writeToAutoexec(l):
	print(l);
	autoexecOut.write(l + "\n");

print("Generarting autoexec.bat");
for l in autoexecLines:
	parts = l.split(" ");
	if len(parts[0]) > 0 and parts[0][0] == "@":
		# Skip, unsure what to do with these outside of DOSBox
		continue;
	elif len(parts[0]) > 0 and parts[0][-1] == ":":
		# Disk switch, assume it should go to d:
		writeToAutoexec("d:");
	elif parts[0] == "mount":
		# TODO: What to do with the disk? For now we always create a second disk image
		relPath = parts[2].strip("\"");
		# TODO: Use .info file to get the working dir, for now assume DOSBOX
		copyPath = basePath / "DOSBOX" / relPath;
		# TODO: Support recursive directory copies
		for item in copyPath.iterdir():
			if not item.is_file():
				continue;
			# Copy the file
			subprocess.run(["mcopy", "-i", mcopyImagePath, "-v", item.absolute(), "::"]);
	elif parts[0] == "exit":
		# Convert to a reboot, we can better handle that in the VM
		writeToAutoexec("shutdown /r /t 0");
	else:
		# Anything else is just copied verbatim
		writeToAutoexec(l);
