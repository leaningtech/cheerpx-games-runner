from pathlib import Path;
import subprocess;
import sys;

basePath = Path(sys.argv[1]);
mcopyImagePath = sys.argv[2];
autoexecOut = open(sys.argv[3], "w");

# Find the *_single.conf file, depending on the game it might be in app/ or in the top-level directory
# TODO: Consider parsing the .info file to get all config files
def findConfigFile(path):
	for item in path.iterdir():
		if item.is_dir():
			ret = findConfigFile(item);
			if ret != None:
				return ret;
		elif item.name.endswith("_single.conf"):
			return item.open("r");

def findDOSBOXPath(path):
	for item in path.iterdir():
		if item.name == "DOSBOX":
			return item.absolute();
		elif item.is_dir():
			ret = findDOSBOXPath(item);
			if ret != None:
				return ret;

configFile = findConfigFile(basePath);
# TODO: Use .info file to get the working dir
dosboxPath = findDOSBOXPath(basePath);

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

print("Generating autoexec.bat");
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
		relPath = parts[2].strip("\"").replace("\\", "/");
		mountType = None;
		for arg in range(3, len(parts)):
			if parts[arg] == "-t":
				assert(arg + 1 < len(parts));
				mountType = parts[arg + 1];
				break;
		if mountType == "overlay":
			print("Skipping overlay %s" % relPath);
			continue;
		copyPath = dosboxPath / relPath;
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
