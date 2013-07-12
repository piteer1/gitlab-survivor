'use strict';

/* Services */


// Demonstrate how to register services
// In this case it is a simple value service.
angular.module('ftDashboard.services', [])
    .value('version', '0.1')
    .value('redmineKey', 'd569bcd8a5c806492e2b63a33d7c9f36ac58a54d')
    .value('gitlabToken', 'Dwxr69bnsh1fZCfqSxyQ')
    .value('jenkinsToken', '2df4bb6d860cb978f93267c6dcfe63c3')
    .value('redmineUri', 'http://ftredmine.i.red-sky.pl/')
    .value('hallLength', 3)
    //defines how long pagination should be done before quitting
    .value('maxRecursiveCalls', 5)
    .factory('projectUri', ['redmineUri', function(redmineUri) {
         return redmineUri + '/projects/filestube/';
    }])
    .value('groupId', 19)
    .value('gitlabProjectId', 73)
    .value('gitlabUri', 'https://git.red-sky.pl/')
    .factory('gitlabProjectUri', ['gitlabUri', 'gitlabProjectId', function(gitlabUri, gitlabProjectId) {
        return gitlabUri + 'api/v3/projects/' + gitlabProjectId + '/';
    }])
    .value('jenkinsUri', 'http://jenkins.i.red-sky.pl/')
    .factory('jenkinsProjectUri', ['jenkinsUri', function(jenkinsUri) {
        return jenkinsUri + 'job/FilesTube-Frontend-Master/api/json';
    }])

    .factory('Versions', ['$resource', 'projectUri', 'redmineKey', function ($resource, projectUri, redmineKey) {
        return $resource(projectUri + 'versions.json', {key: redmineKey});
    }])
    .factory('lastVersion', function() {
        return function(versions) {
            return versions.versions[versions.total_count - 1];
        };
    })

    //factory obtaining data from remote source about issues
    .factory('issues',
        ['$resource', '$q', 'projectUri', 'redmineKey', 'maxRecursiveCalls',
        function($resource, $q, projectUri, redmineKey, maxRecursiveCalls) {
        var limit = 100,
            resource = $resource(projectUri + 'issues.json', {key: redmineKey, status_id: '*', limit: limit});

        return {
            /**
            * Recursively get all issues from current fixed version (current sprint).
            * It has to be done recusirvely because redmine has hardcoded 100 items limit,
            * and you cannot be sure that there are less than 100 items.
            */
            get: function(fixedVersionId) {
                var defer = $q.defer(),
                    offset = 0,
                    recursionDepth = 0,
                    allIssues = [],
                    recursiveGet = function () {
                        resource.get({fixed_version_id: fixedVersionId, offset: offset}, function(issues) {
                            angular.forEach(issues.issues, function(issue) {
                                allIssues.push(issue);
                            });
                            if (issues.issues.length == limit && maxRecursiveCalls > recursionDepth) {
                                offset += limit;
                                recursionDepth++;
                                recursiveGet();
                            } else {
                                defer.resolve(allIssues);
                            }
                        }, function(error) {
                            defer.reject(error);
                        });
                    };

                recursiveGet();
                return defer.promise;
            }
        }
    }])

    .factory('GroupUsers', ['$resource', 'redmineUri', 'redmineKey', 'groupId', function($resource, redmineUri, redmineKey, groupId) {
        return $resource(redmineUri + 'users.json', {key: redmineKey});
    }])

    .factory('hall', [function() {

        var keyUsers = function(users) {
            var usersKeyed = {};
            angular.forEach(users, function (user) {
                user.issues_solved = 0;
                usersKeyed[user.id] = user;
            });

            return usersKeyed;
        };
        return function(issues, users) {
            users = keyUsers(users.users);
            angular.forEach(issues, function(issue) {
                if (issue.assigned_to && /Closed|Rejected/.test(issue.status.name)) {
                    users[issue.assigned_to.id].issues_solved++;
                }
            });
            return users;
        };
    }])

    .factory('gitlabIssues', ['$resource', '$q', 'gitlabProjectUri', 'gitlabToken',
        /**
         * Factory responsible for obtaining data from gitlab
         */
        function($resource, $q, gitlabProjectUri, gitlabToken) {
        //cause we don't know how many issues are needed and there's no necessary filtering, limit it to 100 issues
        var resource = $resource(gitlabProjectUri + 'issues', {private_token: gitlabToken, per_page: 200}, {
                get: {method: 'GET', isArray: true}
            }),
            bugsOpenedSum = 0, bugsByDate = [], bugsSummarized = [], delta = 0;

        return {
            get: function() {
                var defer = $q.defer(),
                    bugsGroupped = {};
                    bugsByDate = [];
                    bugsSummarized = [];
                    bugsOpenedSum = 0;
                resource.get({}, function(issues) {
                    angular.forEach(issues, function(issue) {
                        if (issue.closed == false) {
                            ++bugsOpenedSum;
                        }

                        //var date = issue.created_at.split('T')[0] + 'T00:00:00+02:00';
                        var date = new Date(issue.created_at);
                        date.setHours(0);
                        date.setMinutes(0);
                        date.setSeconds(0);
                        date = date.toISOString();
                        if (bugsGroupped[date] === undefined) {
                            bugsGroupped[date] = {
                                bugsOpened: 0,
                                bugsClosed: 0
                            }
                        }
                        bugsGroupped[date][issue.closed == false ? 'bugsOpened' : 'bugsClosed']++;
                    });

                    angular.forEach(bugsGroupped, function(bugs, day) {
                        bugsByDate.push({
                            date: new Date(Date.parse(day)),
                            bugsOpened: bugs.bugsOpened,
                            bugsClosed: bugs.bugsClosed
                        });
                    });
    
                    //take last 2 weeks
                    bugsByDate = bugsByDate.slice(0, 14);
                    bugsByDate.reverse();

                    defer.resolve(issues);
                }, function(error) {
                    defer.reject(error);
                });
                return defer.promise;
            },

            getBugsOpened: function() {
                return bugsOpenedSum;
            },

            getBugsByDate: function(sprintStartDate) {
                var bugsFromDate = [];
                if (sprintStartDate === undefined) {
                    return bugsByDate;
                }

                sprintStartDate = new Date(sprintStartDate);
                sprintStartDate.setHours(0);
                sprintStartDate.setMinutes(0);
                sprintStartDate.setSeconds(0);
                angular.forEach(bugsByDate, function(bug) {
                    if (bug.date >= sprintStartDate) {
                        bugsFromDate.push(bug);
                    }
                });

                return bugsFromDate;
            },

            /**
             * Calculate summarized amount of bugs by date
             * Returns only bugs which are at current sprint
             */
            getBugsSummarized: function(sprintStartDate) {
                var bugsOpened = 0, bugsSummarized = [], bugsByDate = this.getBugsByDate();

                sprintStartDate = new Date(sprintStartDate);
                sprintStartDate.setHours(0);
                sprintStartDate.setMinutes(0);
                sprintStartDate.setSeconds(0);


                for (var i = 0, len = bugsByDate.length; i < len; ++i) {
                    var today = bugsByDate[i];
                    bugsOpened += today.bugsOpened - today.bugsClosed;
                    if (bugsOpened < 0) bugsOpened = 0;
                    if (today.date >= sprintStartDate) {
                        //push only ones which are from current sprint on graph
                        bugsSummarized.push({
                            date: today.date,
                            bugsOpened: bugsOpened
                        });
                    }
                }

                return bugsSummarized;
            },

            /**
             * Get info how many bugs increased from the beginning of this sprint
             */
            getBugsDelta: function(sprintStartDate) {
                var delta = 0, bugsSummarized = this.getBugsSummarized(sprintStartDate);
                if (bugsSummarized.length) {
                    delta = bugsSummarized[bugsSummarized.length - 1].bugsOpened - bugsSummarized[0].bugsOpened;
                }

                return delta;
            }
        };
    }])

    .factory('gitlabMergeRequests', ['$resource', '$q', 'gitlabProjectUri', 'gitlabToken', 'maxRecursiveCalls',
        /**
         * Factory responsible for merge requests data from gitlab
         */
        function($resource, $q, gitlabProjectUri, gitlabToken, maxRecursiveCalls) {
            var limit = 100, resource = $resource(gitlabProjectUri + 'merge_requests', {private_token: gitlabToken, per_page: limit}, {
                    get: {method: 'GET', isArray: true}
                }),
                mergeRequestsCount = 0,
                page = 1,
                allRequests = [];

            return {
                get: function() {
                    var defer = $q.defer(),
                        mergeRequestsCount = 0,
                        recursionDepth = 0,
                        page = 1,
                        recursiveGet = function() {

                            resource.get({page: page}, function(mergeRequests) {
                                angular.forEach(mergeRequests, function(request) {
                                    if (request.closed == false) {
                                        ++mergeRequestsCount;
                                    }
                                });
                                if (mergeRequests.length == limit && maxRecursiveCalls > recursionDepth) {
                                    page++;
                                    recursionDepth++;
                                    recursiveGet();
                                } else {
                                    defer.resolve(mergeRequestsCount);
                                }
                            }, function(error) {
                               defer.reject(error);
                            });
                        };
                        recursiveGet();

                    return defer.promise;
                }
            };
    }])

    .factory('Jenkins', ['$resource', '$q', 'jenkinsProjectUri', 'jenkinsToken',
        function ($resource, $q, jenkinsProjectUri, jenkinsToken) {
            var resource = $resource(jenkinsProjectUri, {token: jenkinsToken}),
                projectInfo = {};

            return {
                get: function()  {
                    var defer = $q.defer();

                    resource.get({}, function (project) {
                       projectInfo = project;
                       defer.resolve(project);
                    }, function (error) {
                        defer.reject(error);
                    });

                    return defer.promise;
                },
                wasSuccessful: function() {
                    return projectInfo.lastBuild.number == projectInfo.lastSuccessfulBuild.number;
                }
            };
    }]);