/*global define,requestAnimationFrame*/

define(
    [],
    function () {
        "use strict";

        // TODO: Store this in more accessible locations / retrieve from
        // domainObject metadata.
        var DOMAIN_INTERVAL = 2 * 60 * 1000; // Two minutes.

        function PlotController($scope, $q, colorService) {
            var plotHistory = [],
                isLive = true,
                extrema = {},
                unsubscribes = [],
                palette = new colorService.ColorPalette(),
                pendingUpdate;


            function setToDefaultViewport() {
                // TODO: We shouldn't set the viewport until we have received data or something has given us a reasonable viewport.
                if (!extrema.domain || !extrema.range) {
                    return;
                }
                $scope.viewport = {
                    topLeft: {
                        domain: extrema.domain.min,
                        range: extrema.range.max
                    },
                    bottomRight: {
                        domain: extrema.domain.max,
                        range: extrema.range.min
                    }
                };
            }

            setToDefaultViewport();

            $scope.displayableRange = function (rangeValue) {
                // TODO: Call format function provided by domain object.
                return rangeValue;
            };
            $scope.displayableDomain = function (domainValue) {
                // TODO: Call format function provided by domain object.
                return new Date(domainValue).toUTCString();
            };

            $scope.series = [];

            $scope.rectangles = [];

            function addPointToSeries(series, seriesIndex, point) {
                if (!extrema.domain) {
                    extrema.domain = {};
                    extrema.domain.max = extrema.domain.min = point.domain;
                } else {
                    extrema.domain.max = Math.max(
                        extrema.domain.max, point.domain
                    );
                    extrema.domain.min = Math.min(
                        extrema.domain.min, point.domain
                    );
                }
                if (!extrema.range) {
                    extrema.range = {};
                    extrema.range.max = extrema.range.min = point.range;
                } else {
                    extrema.range.max = Math.max(
                        extrema.range.max, point.range
                    );
                    extrema.range.min = Math.min(
                        extrema.range.min, point.range
                    );
                }
                series.data.push(point);
                $scope.$broadcast('series:data:add', seriesIndex, [point]);
            }

            function addTelemetrySeriesToPlotSeries(series, seriesIndex) {
                return function (telemSeries) {
                    var i = 0,
                        len = telemSeries.getPointCount();

                    for (; i < len; i++) {
                        addPointToSeries(series, seriesIndex, {
                            domain: telemSeries.getDomainValue(i),
                            range: telemSeries.getRangeValue(i)
                        });
                    }
                    return;
                };
            }

            function startRealTimeFeed(series, seriesIndex, telemetryCapability) {
                var updater = addTelemetrySeriesToPlotSeries(
                    series,
                    seriesIndex
                );
                unsubscribes.push(telemetryCapability.subscribe(updater));
                return;
            }

            function subscribeToDomainObject(domainObject) {
                var telemetryCapability = domainObject.getCapability('telemetry'),
                    model = domainObject.getModel(),
                    series,
                    seriesIndex;

                series = {
                    name: model.name,
                    // TODO: Bring back PlotPalette.
                    color: palette.getColor($scope.series.length),
                    data: []
                };

                $scope.series.push(series);
                seriesIndex = $scope.series.indexOf(series);

                return telemetryCapability.requestData({})
                    .then(addTelemetrySeriesToPlotSeries(
                        series,
                        seriesIndex
                    ))
                    .then(startRealTimeFeed(
                        series,
                        seriesIndex,
                        telemetryCapability
                    ));

            }

            function unlinkDomainObject() {
                $scope.series = [];
                unsubscribes.forEach(function(unsubscribe) {
                    unsubscribe();
                });
                unsubscribes = [];
            }


            function linkDomainObject(domainObject) {
                unlinkDomainObject();
                if (!domainObject || !domainObject.hasCapability) {
                    return;
                }
                if (domainObject.hasCapability('telemetry')) {
                    subscribeToDomainObject(domainObject);
                } else if (domainObject.hasCapability('delegation')) {
                    // Makes no sense that we have to use a subscription to get domain objects associated with delegates (and their names).  We can map the same series generation code to telemetry delegates; Let's do that ourselves.
                    var subscribeToDelegates = function(delegates) {
                        return $q.all(delegates.map(subscribeToDomainObject));
                        // TODO: Should return a promise.
                    };
                    domainObject
                        .getCapability('delegation')
                        .getDelegates('telemetry')
                        .then(subscribeToDelegates);
                        // TODO: should have a catch.
                } else {
                    throw new Error('Domain object type not supported.');
                }
            }


            function onUserViewportChangeStart() {
                // TODO: this is a great time to track a history entry.
                // Disable live mode so they have full control of viewport.
                plotHistory.push($scope.viewport);
                isLive = false;
            }

            function onUserViewportChangeEnd(event, viewport) {
                // If the new viewport is "close enough" to the maxDomain then
                // enable live mode.  Set empirically to 10% of the domain
                // interval.
                // TODO: Better UX pattern for this.

                // if (Math.abs(maxDomain - viewport.bottomRight.domain) < (DOMAIN_INTERVAL/10)) {
                //     isLive = true;
                //     $scope.viewport.bottomRight.domain = maxDomain;
                // } else {
                //     isLive = false;
                // }
                plotHistory.push(viewport);
            }

             function viewportForExtrema() {
                 return {
                    topLeft: {
                        domain: extrema.domain.min,
                        range: extrema.range.max
                    },
                    bottomRight: {
                        domain: extrema.domain.max,
                        range: extrema.range.min
                    }
                };
            }

            function followDataIfLive() {
                if (pendingUpdate) {
                    return;
                }
                requestAnimationFrame(function () {
                    if (isLive) {
                        $scope.viewport = viewportForExtrema();
                    }
                    pendingUpdate = false;
                });
                pendingUpdate = true;
            }

            $scope.$on('series:data:add', followDataIfLive);
            $scope.$on('user:viewport:change:end', onUserViewportChangeEnd);
            $scope.$on('user:viewport:change:start', onUserViewportChangeStart);

            $scope.$watch('domainObject', linkDomainObject);

            return {
                historyBack: function() {
                    // TODO: Step History Back.
                },
                historyForward: function() {
                    // TODO: Step History Forward.
                },
                resetZoom: function() {
                    // TODO: Reset view to defaults.  Keep history stack alive?
                }
            };
        }

        return PlotController;

    }
);